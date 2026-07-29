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
  "belt",
  "beanie",
  "cap",
  "hat",
  "sunglasses",
  "prescription_glasses",
  "watch",
  "jewelry",
  "necklace",
  "chain",
  "ring",
  "earring",
  "scarf",
  "socks",
  "wallet",
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

const httpsUrl = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be an https:// URL");

const projectOwnedPath = z
  .string()
  .trim()
  .regex(/^\/catalog\/[a-z0-9._-]+\.(jpg|jpeg|png|webp|avif|svg)$/i, "Use https:// or /catalog/… path");

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

/**
 * ADD payload — every field required for a shippable verified product.
 */
export const catalogAddSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(160),
    brand: z.string().trim().min(1, "Brand is required").max(80),
    category: z.enum(CATALOG_CATEGORIES),
    kind: z.enum(CATALOG_KINDS).optional(),
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
    source_url: httpsUrl.optional(),
    image_rights_basis: z.enum(CATALOG_IMAGE_RIGHTS),
    verification_method: z.enum(CATALOG_VERIFICATION_METHODS),

    affiliate: z.boolean().default(false),
    affiliate_disclosure: z.string().trim().max(200).optional().or(z.literal("")),

    description: z.string().trim().max(400).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    // If the image is a project-owned path, rights basis must say so.
    const isProjectPath = /^\/catalog\//.test(val.image_url);
    if (isProjectPath && val.image_rights_basis !== "project_owned") {
      ctx.addIssue({
        code: "custom",
        path: ["image_rights_basis"],
        message: "Project-owned paths require image_rights_basis=project_owned",
      });
    }
    if (!isProjectPath && val.image_rights_basis === "project_owned") {
      ctx.addIssue({
        code: "custom",
        path: ["image_rights_basis"],
        message: "project_owned requires a /catalog/… path",
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

export const CATALOG_IMAGE_WARNING =
  "Only add product images and information you are authorized to display. Do not copy retailer photography without permission.";
