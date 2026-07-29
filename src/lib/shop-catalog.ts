import { hasValidBuyUrl, type CatalogItem } from "./shop-gap";

/**
 * Provenance fields added by the Pass 1 foundation migration. Optional on the
 * shared CatalogItem type so existing rows/tests keep compiling; enforced by
 * `isVerifiedPurchasable` below.
 */
export type CatalogProvenance = {
  source_type?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  image_rights_basis?: string | null;
  verified_at?: string | null;
  verification_method?: string | null;
  affiliate?: boolean | null;
  affiliate_disclosure?: string | null;
};

export type VerifiableCatalogItem = CatalogItem & CatalogProvenance;
export type ShopScope = "verified" | "demo" | "all";

export type ProductAction =
  | { kind: "retailer"; label: "Shop now"; href: string }
  | { kind: "sample"; label: "View Sample"; href: null }
  | { kind: "needs_verification"; label: "Needs verification"; href: null }
  | { kind: "unavailable"; label: "Unavailable"; href: null };

/** Verified-product freshness window. Anything older is treated as stale. */
export const VERIFIED_FRESHNESS_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const ALLOWED_AVAILABILITY = new Set(["in_stock", "low_stock", "preorder"]);
const ALLOWED_SOURCE_TYPES = new Set(["manual", "affiliate_feed", "partner_api", "verified"]);
const ALLOWED_IMAGE_RIGHTS = new Set(["authorized", "project_owned", "licensed"]);
const ALLOWED_VERIFICATION_METHODS = new Set(["manual", "feed", "partner_api"]);

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFreshIso(iso: unknown, now: number = Date.now()): iso is string {
  if (!isNonEmpty(iso)) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return now - t <= VERIFIED_FRESHNESS_MS && t <= now + 60_000;
}

/**
 * Strict predicate. A catalog row may be treated as a verified, purchasable
 * product ONLY when every field below is present and valid. Demo rows and
 * rows missing provenance never qualify.
 */
export function isVerifiedPurchasable(
  item: VerifiableCatalogItem,
  now: number = Date.now(),
): boolean {
  if (!item) return false;
  if (item.is_demo === true) return false;

  // Product identity
  if (!isNonEmpty(item.name)) return false;
  if (!isNonEmpty(item.brand)) return false;
  if (!isNonEmpty(item.retailer)) return false;

  // Destination URL — real https link required.
  if (!hasValidBuyUrl(item)) return false;
  if (!isNonEmpty(item.buy_url) || !/^https:\/\//i.test(item.buy_url)) return false;

  // Authorized image (either an https URL or a project-owned storage path,
  // paired with an explicit rights basis).
  if (!isNonEmpty(item.image_url)) return false;
  if (!isNonEmpty(item.image_rights_basis)) return false;
  if (!ALLOWED_IMAGE_RIGHTS.has(item.image_rights_basis)) return false;

  // Provenance
  if (!isNonEmpty(item.source_type)) return false;
  if (!ALLOWED_SOURCE_TYPES.has(item.source_type)) return false;
  if (!isNonEmpty(item.source_name)) return false;
  if (!isNonEmpty(item.verification_method)) return false;
  if (!ALLOWED_VERIFICATION_METHODS.has(item.verification_method)) return false;
  if (!isFreshIso(item.verified_at, now)) return false;

  // Pricing — must be a positive number.
  const price = item.current_price ?? item.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return false;

  // Availability signal
  if (!isNonEmpty(item.availability)) return false;
  if (!ALLOWED_AVAILABILITY.has(item.availability)) return false;

  // Last-checked freshness
  if (!isFreshIso(item.last_checked_at, now)) return false;

  return true;
}

function normalizeIdentityPart(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function catalogIdentityKey(item: CatalogItem): string {
  if (item.external_id?.trim()) {
    return ["external", item.retailer, item.external_id].map(normalizeIdentityPart).join("|");
  }

  return [item.brand, item.name, item.category, item.color, item.condition]
    .map(normalizeIdentityPart)
    .join("|");
}

export function dedupeCatalog(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = catalogIdentityKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function catalogMatchesScope(
  item: VerifiableCatalogItem,
  scope: ShopScope,
  now: number = Date.now(),
): boolean {
  if (scope === "verified") return isVerifiedPurchasable(item, now);
  if (scope === "demo") return item.is_demo === true;
  return true;
}

/**
 * Keep the score/order produced by the gap engine within each partition.
 * In All, verified purchasable products precede demo and incomplete rows.
 */
export function rankCatalogForScope<T extends { item: VerifiableCatalogItem }>(
  items: T[],
  scope: ShopScope,
  now: number = Date.now(),
): T[] {
  const matching = items.filter(({ item }) => catalogMatchesScope(item, scope, now));
  if (scope !== "all") return matching;
  return [
    ...matching.filter(({ item }) => isVerifiedPurchasable(item, now)),
    ...matching.filter(({ item }) => !isVerifiedPurchasable(item, now)),
  ];
}

export function catalogWindowSize(total: number, maximum = 12): number {
  if (total <= 1) return Math.max(0, total);
  return Math.min(maximum, Math.floor(total / 2));
}

export function prioritizeUnseenCatalog<T extends { item: { id: string } }>(
  items: T[],
  immediatelyShown: ReadonlySet<string>,
): T[] {
  if (immediatelyShown.size === 0) return items;
  return [
    ...items.filter(({ item }) => !immediatelyShown.has(item.id)),
    ...items.filter(({ item }) => immediatelyShown.has(item.id)),
  ];
}

/**
 * Decide the user-facing action for a catalog card.
 *
 * - Demo rows → View Sample (never a retailer link).
 * - Verified non-demo rows that fully pass gating → Shop now.
 * - Any other non-demo row → Needs verification (or Unavailable if the
 *   row explicitly reports out_of_stock/discontinued).
 */
export function productActionFor(item: VerifiableCatalogItem): ProductAction {
  if (item.is_demo === true) {
    return { kind: "sample", label: "View Sample", href: null };
  }
  if (isVerifiedPurchasable(item)) {
    return { kind: "retailer", label: "Shop now", href: item.buy_url as string };
  }
  const availability = (item.availability ?? "").toString();
  if (availability === "out_of_stock" || availability === "discontinued") {
    return { kind: "unavailable", label: "Unavailable", href: null };
  }
  return { kind: "needs_verification", label: "Needs verification", href: null };
}
