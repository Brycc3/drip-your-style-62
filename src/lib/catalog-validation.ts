import { z } from "zod";

/**
 * Shared validation for the Catalog Manager. Used by both the Add/Edit UI and
 * the server function so a payload that reaches the DB has already been
 * checked against the same rules on both sides.
 *
 * IMPORTANT: is_demo is not part of this schema. Demo rows are read-only —
 * neither the client nor the server may set or change is_demo through this
 * path.
 */

export const CATALOG_CATEGORIES = [
  "top",
  "tee",
  "hoodie",
  "shirt",
  "polo",
  "bottom",
  "trousers",
  "cargos",
  "joggers",
  "shorts",
  "denim",
  "outerwear",
  "bomber",
  "chore",
  "jacket",
  "coat",
  "shoes",
  "sneaker",
  "jordan",
  "vomero",
  "new_balance",
  "loafer",
  "boot",
  "runner",
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
  "sock",
  "socks",
  "sunglasses",
  "watch",
  "watches",
  "wallet",
  "wallets",
  "fragrance",
  "cologne",
  "edp",
  "edt",
  "parfum",
] as const;

export const CATALOG_CONDITIONS = ["new", "vintage", "thrift", "resale"] as const;
export const CATALOG_AVAILABILITY = [
  "in_stock",
  "low_stock",
  "preorder",
  "out_of_stock",
  "discontinued",
] as const;
export const CATALOG_SOURCE_TYPES = [
  "manual",
  "affiliate_feed",
  "partner_api",
  "verified",
] as const;
export const CATALOG_VERIFICATION_METHODS = ["manual", "feed", "partner_api"] as const;
export const CATALOG_IMAGE_RIGHTS = ["authorized", "project_owned", "licensed"] as const;
export const CATALOG_KINDS = ["clothing", "shoes", "accessory", "fragrance"] as const;
export const CATALOG_PRICE_TIERS = ["entry", "mid", "premium", "luxury"] as const;
export const CATALOG_ACCESSORY_SUBTYPES = [
  "earrings",
  "glasses",
  "prescription_glasses",
  "sunglasses",
  "necklaces",
  "chains",
  "bracelets",
  "rings",
  "watches",
  "hat",
  "cap",
  "beanie",
  "belts",
  "bags",
  "socks",
  "scarves",
  "wallets",
  "grills",
  "jewelry",
] as const;
export const CATALOG_FRAGRANCE_FAMILIES = [
  "fresh",
  "woody",
  "warm",
  "sweet",
  "aquatic",
  "floral",
  "leather",
  "other",
] as const;

export function isValidHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const PROJECT_CATALOG_IMAGE_PATTERN =
  /^\/catalog\/(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\.(jpg|jpeg|png|webp|avif|svg)$/i;

export function isProjectOwnedCatalogImage(value: unknown): value is string {
  return typeof value === "string" && PROJECT_CATALOG_IMAGE_PATTERN.test(value);
}

export function isValidCatalogImageReference(value: unknown): value is string {
  return isValidHttpsUrl(value) || isProjectOwnedCatalogImage(value);
}

export function catalogImageRightsAreConsistent(imageUrl: unknown, rightsBasis: unknown): boolean {
  if (!isValidCatalogImageReference(imageUrl)) return false;
  if (!CATALOG_IMAGE_RIGHTS.includes(rightsBasis as (typeof CATALOG_IMAGE_RIGHTS)[number]))
    return false;
  return isProjectOwnedCatalogImage(imageUrl)
    ? rightsBasis === "project_owned"
    : rightsBasis === "authorized" || rightsBasis === "licensed";
}

const httpsUrl = z
  .string()
  .trim()
  .min(1, "Required")
  .refine(isValidHttpsUrl, "Must be an https:// URL");

const projectOwnedPath = z
  .string()
  .trim()
  .regex(PROJECT_CATALOG_IMAGE_PATTERN, "Use https:// or /catalog/… path");

/**
 * Image reference: either an https URL to an authorized/licensed remote asset
 * OR a project-owned path under /catalog/*. Server also cross-checks the
 * chosen rights basis.
 */
const imageReference = z.union([httpsUrl, projectOwnedPath]);

const priceSchema = z
  .number({ required_error: "Price is required", invalid_type_error: "Price is required" })
  .finite()
  .positive("Price must be greater than 0")
  .max(100000, "Price looks wrong");

const CLOTHING_CATEGORIES = new Set<string>([
  "top",
  "tee",
  "hoodie",
  "shirt",
  "polo",
  "bottom",
  "trousers",
  "cargos",
  "joggers",
  "shorts",
  "denim",
  "outerwear",
  "bomber",
  "chore",
  "jacket",
  "coat",
]);
const SHOE_CATEGORIES = new Set<string>([
  "shoes",
  "sneaker",
  "jordan",
  "vomero",
  "new_balance",
  "loafer",
  "boot",
  "runner",
]);
const FRAGRANCE_CATEGORIES = new Set<string>(["fragrance", "cologne", "edp", "edt", "parfum"]);

export function deriveCatalogKind(
  category: (typeof CATALOG_CATEGORIES)[number],
): (typeof CATALOG_KINDS)[number] {
  if (CLOTHING_CATEGORIES.has(category)) return "clothing";
  if (SHOE_CATEGORIES.has(category)) return "shoes";
  if (FRAGRANCE_CATEGORIES.has(category)) return "fragrance";
  return "accessory";
}

/**
 * Add/edit payload — every field required before an explicit verification.
 */
export const catalogAddSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(160),
    brand: z.string().trim().min(1, "Brand is required").max(80),
    category: z.enum(CATALOG_CATEGORIES),
    kind: z.enum(CATALOG_KINDS),
    color: z.string().trim().min(1, "Color is required").max(60),
    material: z.string().trim().max(80).optional().or(z.literal("")),
    fit: z.string().trim().max(40).optional().or(z.literal("")),
    formality: z
      .enum(["loungewear", "casual", "smart_casual", "business", "formal"])
      .default("casual"),
    season: z.enum(["all", "spring", "summer", "fall", "winter"]).default("all"),
    condition: z.enum(CATALOG_CONDITIONS).default("new"),

    retailer: z.string().trim().min(1, "Retailer is required").max(80),
    buy_url: httpsUrl,
    image_url: imageReference,

    current_price: priceSchema,
    original_price: priceSchema.optional(),

    availability: z.enum(CATALOG_AVAILABILITY),

    source_type: z.enum(CATALOG_SOURCE_TYPES),
    source_name: z.string().trim().min(1, "Source name is required").max(120),
    source_url: httpsUrl.optional().or(z.literal("")),
    image_rights_basis: z.enum(CATALOG_IMAGE_RIGHTS),
    verification_method: z.enum(CATALOG_VERIFICATION_METHODS),

    vibe: z.string().trim().min(1, "Vibe is required").max(80),
    price_tier: z.enum(CATALOG_PRICE_TIERS),
    accessory_subtype: z.enum(CATALOG_ACCESSORY_SUBTYPES).optional().or(z.literal("")),
    fragrance_family: z.enum(CATALOG_FRAGRANCE_FAMILIES).optional().or(z.literal("")),

    affiliate: z.boolean().default(false),
    affiliate_disclosure: z.string().trim().max(200).optional().or(z.literal("")),

    description: z.string().trim().max(400).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    // If the image is a project-owned path, rights basis must say so.
    if (!catalogImageRightsAreConsistent(val.image_url, val.image_rights_basis)) {
      ctx.addIssue({
        code: "custom",
        path: ["image_rights_basis"],
        message:
          "Project paths require project_owned rights; remote images require authorized or licensed rights",
      });
    }
    const expectedKind = deriveCatalogKind(val.category);
    if (val.kind !== expectedKind) {
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: `${val.category} must use kind=${expectedKind}`,
      });
    }
    if (expectedKind === "accessory" && !val.accessory_subtype) {
      ctx.addIssue({
        code: "custom",
        path: ["accessory_subtype"],
        message: "Accessory products require an accessory subtype",
      });
    }
    if (expectedKind !== "accessory" && val.accessory_subtype) {
      ctx.addIssue({
        code: "custom",
        path: ["accessory_subtype"],
        message: "Accessory subtype is only valid for accessory products",
      });
    }
    if (expectedKind === "fragrance" && !val.fragrance_family) {
      ctx.addIssue({
        code: "custom",
        path: ["fragrance_family"],
        message: "Fragrances require a fragrance family",
      });
    }
    if (expectedKind !== "fragrance" && val.fragrance_family) {
      ctx.addIssue({
        code: "custom",
        path: ["fragrance_family"],
        message: "Fragrance family is only valid for fragrance products",
      });
    }
    if (val.affiliate && !val.affiliate_disclosure) {
      ctx.addIssue({
        code: "custom",
        path: ["affiliate_disclosure"],
        message: "Affiliate links require a disclosure",
      });
    }
    if (
      val.original_price !== undefined &&
      val.original_price !== null &&
      val.original_price < val.current_price
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["original_price"],
        message: "Original price cannot be lower than current price",
      });
    }
  });

export type CatalogAddInput = z.infer<typeof catalogAddSchema>;

/**
 * UPDATE payload — same fields, all required (we always re-post the whole
 * row from the Edit form so the shape is unambiguous).
 */
export const catalogUpdateSchema = catalogAddSchema;
export type CatalogUpdateInput = z.infer<typeof catalogUpdateSchema>;

export function buildCatalogPayload(input: CatalogAddInput): Record<string, unknown> {
  return {
    name: input.name,
    brand: input.brand,
    category: input.category,
    kind: input.kind,
    color: input.color,
    material: input.material || null,
    fit: input.fit || null,
    formality: input.formality,
    season: input.season,
    condition: input.condition,
    retailer: input.retailer,
    buy_url: input.buy_url,
    image_url: input.image_url,
    current_price: input.current_price,
    price: input.current_price,
    original_price: input.original_price ?? null,
    availability: input.availability,
    source_type: input.source_type,
    source_name: input.source_name,
    source_url: input.source_url || null,
    image_rights_basis: input.image_rights_basis,
    verification_method: input.verification_method,
    vibe: input.vibe,
    price_tier: input.price_tier,
    accessory_subtype: input.accessory_subtype || null,
    fragrance_family: input.fragrance_family || null,
    affiliate: input.affiliate,
    affiliate_disclosure: input.affiliate_disclosure || null,
    description: input.description || null,
  };
}

export function buildNewCatalogPayload(input: CatalogAddInput): Record<string, unknown> {
  return {
    ...buildCatalogPayload(input),
    verified_at: null,
    last_checked_at: null,
    is_demo: false,
    archived: false,
  };
}

export function assertCatalogRowWritable(row: {
  is_demo?: boolean | null;
  source?: string | null;
}): void {
  if (row.is_demo === true || row.source === "phase_2_curated_demo") {
    throw new Error("Demo products are read-only. Add a new verified product instead.");
  }
}

export const CATALOG_IMAGE_WARNING =
  "Only add product images and information you are authorized to display. Do not copy retailer photography without permission.";
