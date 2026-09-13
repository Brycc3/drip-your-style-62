import type { ClosetItem } from "./outfit-generator";
import { colorHarmonyScore, silhouetteScore } from "./outfit-generator";
import type { ShoppingBudget } from "./style-preferences";
import { isVerifiedPurchasable } from "./shop-catalog";

export type CatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  color: string | null;
  material?: string | null;
  fit?: string | null;
  price: number | null;
  current_price?: number | null;
  original_price?: number | null;
  currency?: string | null;
  available_sizes?: string[] | null;
  source_updated_at?: string | null;
  condition: "new" | "vintage" | "thrift" | "resale";
  image_url: string | null;
  formality: string;
  season: string;
  retailer?: string | null;
  buy_url?: string | null;
  availability?: string | null;
  last_checked_at?: string | null;
  external_id?: string | null;
  is_demo?: boolean;
  archived?: boolean | null;
  kind?: string; // clothing | shoes | accessory | fragrance
  vibe?: string | null;
  price_tier?: string | null;
  accessory_subtype?: string | null;
  fragrance_family?: string | null;
  description?: string | null;
};

export type GapScore = {
  item: CatalogItem;
  score: number;
  reasons: string[];
  matches: ClosetItem[];
  outfitsUnlocked: number;
  duplicate: boolean;
  duplicateNote?: string;
  guidance: "Consider buying" | "Skip for now" | "Check details" | "Sample only";
  guidanceReason: string;
  uncertainties: string[];
  exampleOutfit: ClosetItem[];
  countCapped: boolean;
};

const TARGETS: Record<string, number> = {
  top: 5,
  bottom: 4,
  outerwear: 2,
  shoes: 3,
  accessory: 3,
};

const F = { loungewear: 0, casual: 1, smart_casual: 2, business: 3, formal: 4 } as Record<
  string,
  number
>;
function fRank(x: string) {
  return F[x] ?? 1;
}
function isPair(a: ClosetItem | CatalogItem, b: ClosetItem | CatalogItem): boolean {
  const fa = (a as { formality?: string }).formality ?? "casual";
  const fb = (b as { formality?: string }).formality ?? "casual";
  if (fa !== fb && Math.abs(fRank(fa) - fRank(fb)) > 1) return false;
  const seasons = (s?: string | null) =>
    !s || s === "all" ? ["spring", "summer", "fall", "winter"] : s.split(/[ ,/]+/);
  if (!seasons(a.season).some((s) => seasons(b.season).includes(s))) return false;
  return colorHarmonyScore([a.color, b.color]).score >= 0.6;
}

const ACCESSORY_CATEGORIES = new Set([
  "accessory",
  "bag",
  "bags",
  "belt",
  "belts",
  "beanie",
  "bracelet",
  "bracelets",
  "cap",
  "chain",
  "chains",
  "earring",
  "earrings",
  "eyeglasses",
  "glasses",
  "grill",
  "grills",
  "hat",
  "hats",
  "jewelry",
  "necklace",
  "necklaces",
  "prescription_glasses",
  "ring",
  "rings",
  "scarf",
  "scarves",
  "socks",
  "sunglasses",
  "tie",
  "wallet",
  "wallets",
  "watch",
  "watches",
]);

export function isAccessoryCategory(category: string): boolean {
  return ACCESSORY_CATEGORIES.has(
    category
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  );
}

// Coarse mapping from many subcategories to the 5 primary generator slots.
export function primary(
  cat: string,
): "top" | "bottom" | "outerwear" | "shoes" | "accessory" | "other" {
  const c = cat.toLowerCase();
  if (["top", "tee", "hoodie", "shirt", "polo"].includes(c)) return "top";
  if (["bottom", "trousers", "cargos", "joggers", "shorts", "denim", "pants"].includes(c))
    return "bottom";
  if (["outerwear", "bomber", "chore", "jacket", "coat"].includes(c)) return "outerwear";
  if (
    ["shoes", "sneaker", "jordan", "vomero", "new_balance", "loafer", "boot", "runner"].includes(c)
  )
    return "shoes";
  if (isAccessoryCategory(c)) return "accessory";
  return "other";
}

export function scoreGap(
  item: CatalogItem,
  closet: ClosetItem[],
  budget?: ShoppingBudget | null,
): GapScore {
  closet = [
    ...new Map(
      closet.filter((c) => !c.archived && c.kind !== "fragrance").map((c) => [c.id, c]),
    ).values(),
  ];
  const slot = primary(item.category);
  const owned = closet.filter(
    (c) =>
      primary(c.category) === slot &&
      (slot !== "accessory" ||
        accessorySubcategory(c as CatalogItem) === accessorySubcategory(item)),
  );
  const target = TARGETS[slot] ?? 2;
  const shortfall = Math.max(0, target - owned.length) / target;

  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const duplicateItem = owned.find(
    (o) =>
      norm(o.name) === norm(item.name) &&
      !!norm(item.brand) &&
      norm(o.brand) === norm(item.brand) &&
      !!norm(item.color) &&
      norm(o.color) === norm(item.color) &&
      (!o.material || !item.material || norm(o.material) === norm(item.material)) &&
      (!o.fit || !item.fit || norm(o.fit) === norm(item.fit)),
  );
  const duplicate = !!duplicateItem;
  const similar =
    !duplicate && owned.find((o) => !!item.color && norm(o.color) === norm(item.color));

  const tops = closet.filter((c) => primary(c.category) === "top");
  const bottoms = closet.filter((c) => primary(c.category) === "bottom");
  const shoes = closet.filter((c) => primary(c.category) === "shoes");
  let unlocked = 0;
  const matchMap = new Map<string, ClosetItem>();
  let exampleOutfit: ClosetItem[] = [];
  let checked = 0;
  let countCapped = false;
  // Count complete top + bottom + shoes combinations, including the proposed item
  // (or a fourth outer/accessory). Never fill a missing owned slot with a phantom.
  if (slot !== "other") {
    combos: for (const t of slot === "top" ? [item] : tops) {
      for (const b of slot === "bottom" ? [item] : bottoms) {
        for (const s of slot === "shoes" ? [item] : shoes) {
          if (++checked > 10000) {
            countCapped = true;
            break combos;
          }
          const pieces = [t, b, s, ...(["outerwear", "accessory"].includes(slot) ? [item] : [])];
          if (!pieces.every((p, i) => pieces.slice(i + 1).every((q) => isPair(p, q)))) continue;
          if (silhouetteScore(t as ClosetItem, b as ClosetItem).score < 0.6) continue;
          unlocked++;
          const ownedPieces = pieces.filter((p) => p !== item) as ClosetItem[];
          if (!exampleOutfit.length) exampleOutfit = ownedPieces;
          for (const p of ownedPieces) matchMap.set(p.id, p);
        }
      }
    }
  }
  const matches = [...matchMap.values()];

  const reasons: string[] = [];
  if (slot === "other") {
    reasons.push(`fragrance / lifestyle pick`);
  } else if (shortfall > 0)
    reasons.push(
      `Room in your ${slot} category (${owned.length}/${target} guide, not a buying target)`,
    );
  else reasons.push(`you already own ${owned.length} ${slot}${owned.length === 1 ? "" : "s"}`);
  if (unlocked > 0)
    reasons.push(
      `${unlocked}${countCapped ? "+" : ""} plausible complete outfit${unlocked === 1 ? "" : "s"} with owned pieces`,
    );
  else if (slot !== "other")
    reasons.push("No complete compatible outfit found — check your tops, bottoms and shoes.");
  if (duplicate)
    reasons.push(`Possible duplicate of ${duplicateItem!.name}; confirm the model and details.`);
  if (similar)
    reasons.push(`Similar color and role to ${similar.name}; not evidence of an exact duplicate.`);
  const uncertainties: string[] = [];
  if ([item, ...matches].some((p) => !p.color || !p.fit || !p.season || !p.formality))
    uncertainties.push(
      "Some color, fit, season or dress-code tags are missing; compatibility is an estimate.",
    );
  uncertainties.push(
    "Check measurements, comfort and retailer sizing; tags cannot prove physical fit.",
  );
  const price = item.current_price ?? item.price;
  const comparable =
    budget &&
    item.currency === budget.currency &&
    typeof price === "number" &&
    Number.isFinite(price) &&
    price > 0;
  if (!budget) uncertainties.push("Set a per-item budget in Profile for price guidance.");
  else if (!comparable)
    uncertainties.push("Price or matching currency is missing; no exchange rate is assumed.");
  let guidance: GapScore["guidance"] = "Check details";
  let guidanceReason = "Confirm price, budget and wardrobe usefulness before deciding.";
  if (duplicate || (comparable && price > budget.amount) || (slot !== "other" && unlocked === 0)) {
    guidance = "Skip for now";
    guidanceReason = duplicate
      ? "Check the piece you already own before buying another."
      : comparable && price > budget.amount
        ? `Above your ${budget.currency} ${budget.amount} per-item limit; keep the money for a more useful gap.`
        : "Build a complete outfit with what you own first.";
  } else if (comparable && unlocked > 0 && shortfall > 0) {
    guidance = "Consider buying";
    guidanceReason = `Within your ${budget.currency} ${budget.amount} limit and fills a thin wardrobe category. This is not a purchase guarantee.`;
  }
  if (item.is_demo !== false) {
    guidance = "Sample only";
    guidanceReason =
      "Demo concept, not an offer. Compatibility previews never mean this product is available to buy.";
  } else if (guidance === "Consider buying" && !isVerifiedPurchasable(item)) {
    guidance = "Check details";
    guidanceReason =
      "Potential wardrobe match, but product verification is incomplete or stale. Reverification is required before shopping.";
  }

  const score = Math.max(
    0,
    Math.min(1, shortfall * 0.5 + Math.min(1, unlocked / 8) * 0.4 - (duplicate ? 0.4 : 0) + 0.1),
  );

  return {
    item,
    score,
    reasons,
    matches: matches.slice(0, 4),
    outfitsUnlocked: unlocked,
    duplicate,
    guidance,
    guidanceReason,
    uncertainties,
    exampleOutfit,
    countCapped,
    duplicateNote: duplicate ? `Possible duplicate: ${duplicateItem!.name}` : undefined,
  };
}

export function scoreCatalog(
  catalog: CatalogItem[],
  closet: ClosetItem[],
  opts?: { recentlyShown?: Set<string>; seed?: number; budget?: ShoppingBudget | null },
): GapScore[] {
  const recent = opts?.recentlyShown ?? new Set<string>();
  const seed = opts?.seed ?? 0;
  const scored = catalog.map((c) => {
    const g = scoreGap(c, closet, opts?.budget);
    // Diversity penalty for anything shown in this session's last rotation.
    let s = g.score;
    if (recent.has(c.id)) s -= 0.25;
    // Deterministic jitter (per-item hash mixed with seed) so refresh reshuffles ties.
    const h = hashStr(c.id + ":" + seed) % 1000;
    s += (h / 1000) * 0.05;
    return { ...g, score: Math.max(0, Math.min(1, s)) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Accessory subcategory taxonomy — used by the Shop Accessories tab.
export type AccessorySub =
  | "earrings"
  | "glasses"
  | "prescription_glasses"
  | "sunglasses"
  | "necklaces"
  | "chains"
  | "bracelets"
  | "rings"
  | "watches"
  | "hat"
  | "cap"
  | "beanie"
  | "belts"
  | "bags"
  | "socks"
  | "scarves"
  | "wallets"
  | "grills"
  | "jewelry"
  | "other";

export const ACCESSORY_SUBTYPE_FILTERS: ReadonlyArray<{
  value: AccessorySub | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "earrings", label: "Earrings" },
  { value: "glasses", label: "Glasses" },
  { value: "prescription_glasses", label: "Prescription glasses" },
  { value: "sunglasses", label: "Sunglasses" },
  { value: "necklaces", label: "Necklaces" },
  { value: "chains", label: "Chains" },
  { value: "bracelets", label: "Bracelets" },
  { value: "rings", label: "Rings" },
  { value: "watches", label: "Watches" },
  { value: "hat", label: "Hats" },
  { value: "cap", label: "Caps" },
  { value: "beanie", label: "Beanies" },
  { value: "belts", label: "Belts" },
  { value: "bags", label: "Bags" },
  { value: "socks", label: "Socks" },
  { value: "scarves", label: "Scarves" },
  { value: "wallets", label: "Wallets" },
  { value: "grills", label: "Grills" },
  { value: "jewelry", label: "Other jewelry" },
] as const;

export function accessorySubcategory(item: CatalogItem): AccessorySub {
  const explicit = item.accessory_subtype?.trim() as AccessorySub | undefined;
  if (
    explicit &&
    ACCESSORY_SUBTYPE_FILTERS.some((filter) => filter.value !== "all" && filter.value === explicit)
  )
    return explicit;

  const blob = `${item.category} ${item.name} ${item.brand ?? ""}`.toLowerCase();
  if (/(sunglass|shades)/.test(blob)) return "sunglasses";
  if (/(prescription|optical|eyeglass|eye glass|spectacle|glasses|eyewear)/.test(blob))
    return "prescription_glasses";
  if (/(earring|ear stud)/.test(blob)) return "earrings";
  if (/necklace|pendant/.test(blob)) return "necklaces";
  if (/\bchain(s)?\b/.test(blob)) return "chains";
  if (/bracelet|bangle/.test(blob)) return "bracelets";
  if (/\bring(s)?\b/.test(blob)) return "rings";
  if (/grill/.test(blob)) return "grills";
  if (/watch|timepiece/.test(blob)) return "watches";
  if (/(beanie|toque)/.test(blob)) return "beanie";
  if (/\bcap\b/.test(blob)) return "cap";
  if (/(hat|bucket|fedora)/.test(blob)) return "hat";
  if (/belt/.test(blob)) return "belts";
  if (/(bag|tote|crossbody|backpack|sling|duffle|clutch)/.test(blob)) return "bags";
  if (/sock/.test(blob)) return "socks";
  if (/scarf/.test(blob)) return "scarves";
  if (/wallet|cardholder/.test(blob)) return "wallets";
  if (/jewel/.test(blob)) return "jewelry";
  return "other";
}

// Fragrance family classifier (fresh/woody/warm/sweet/aquatic/floral).
export type FragranceFamily =
  "fresh" | "woody" | "warm" | "sweet" | "aquatic" | "floral" | "leather" | "other";

export function fragranceFamily(item: CatalogItem): FragranceFamily {
  const explicit = item.fragrance_family?.trim() as FragranceFamily | undefined;
  if (
    explicit &&
    ["fresh", "woody", "warm", "sweet", "aquatic", "floral", "leather", "other"].includes(explicit)
  )
    return explicit;

  const blob = `${item.name} ${item.brand ?? ""} ${item.color ?? ""}`.toLowerCase();
  if (/(aqua|marine|salt|ocean|sea)/.test(blob)) return "aquatic";
  if (/(citrus|bergamot|lemon|mint|green|fresh|cologne)/.test(blob)) return "fresh";
  if (/(oud|sandal|cedar|vetiver|wood)/.test(blob)) return "woody";
  if (/(amber|spice|tobacco|warm|cinnamon|clove)/.test(blob)) return "warm";
  if (/(vanilla|caramel|sweet|gourmand|choco|honey)/.test(blob)) return "sweet";
  if (/(rose|jasmine|floral|iris|violet|lily)/.test(blob)) return "floral";
  if (/leather|suede/.test(blob)) return "leather";
  return "other";
}

export function hasValidBuyUrl(item: CatalogItem): boolean {
  const purchasableAvailability = new Set(["in_stock", "low_stock", "preorder"]);
  if (
    item.is_demo !== false ||
    !item.buy_url ||
    !item.retailer?.trim() ||
    !item.availability ||
    !purchasableAvailability.has(item.availability) ||
    !item.last_checked_at
  )
    return false;
  try {
    const u = new URL(item.buy_url);
    return (
      u.protocol === "https:" &&
      Number.isFinite(Date.parse(item.last_checked_at)) &&
      !/demo|sample/i.test(item.retailer)
    );
  } catch {
    return false;
  }
}
