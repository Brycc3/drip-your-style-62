import { z } from "zod";
import {
  CATALOG_CURRENCIES,
  catalogAddSchema,
  isValidHttpsUrl,
  type CatalogAddInput,
} from "./catalog-validation";

export const CATALOG_IMPORT_FORMATS = ["csv", "json"] as const;
export type CatalogImportFormat = (typeof CATALOG_IMPORT_FORMATS)[number];
export type ImportDecision = "create" | "update" | "skip" | "manual_review";

export type CatalogImportProduct = CatalogAddInput & {
  currency: (typeof CATALOG_CURRENCIES)[number];
  external_id?: string;
  available_sizes: string[];
  source_updated_at?: string;
};

export type ValidatedCatalogImportRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  normalized: Partial<CatalogImportProduct>;
  errors: string[];
  warnings: string[];
};

export type ExistingCatalogIdentity = {
  id: string;
  external_id?: string | null;
  retailer?: string | null;
  buy_url?: string | null;
  brand?: string | null;
  name: string;
  color?: string | null;
  is_demo?: boolean | null;
};

export type PlannedCatalogImportRow = ValidatedCatalogImportRow & {
  action: ImportDecision;
  catalogId?: string;
  duplicateReason?: string;
};

const additionalImportFields = z.object({
  currency: z.enum(CATALOG_CURRENCIES).default("USD"),
  external_id: z.string().trim().max(160).optional().or(z.literal("")),
  available_sizes: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  source_updated_at: z.string().datetime({ offset: true }).optional().or(z.literal("")),
});

const catalogImportProductSchema = z
  .intersection(catalogAddSchema, additionalImportFields)
  .superRefine((value, ctx) => {
    if (!value.description?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: "Description is required for a real product import",
      });
    }
    if (value.source_type === "verified") {
      ctx.addIssue({
        code: "custom",
        path: ["source_type"],
        message: "Imports must use manual, affiliate_feed, or partner_api provenance",
      });
    }
  });

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizedToken(value: unknown): string {
  return cell(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function optionalText(value: unknown): string | undefined {
  const result = cell(value);
  return result || undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const token = normalizedToken(value);
  if (["true", "yes", "1"].includes(token)) return true;
  if (["false", "no", "0", ""].includes(token)) return false;
  return undefined;
}

function parsePrice(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const token = cell(value).replace(/[$,]/g, "");
  if (!token) return undefined;
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSizes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cell).filter(Boolean);
  const token = cell(value);
  if (!token) return [];
  return token
    .split(/[|;]/)
    .map((size) => size.trim())
    .filter(Boolean);
}

function normalizeRawProduct(raw: Record<string, unknown>): Partial<CatalogImportProduct> {
  return {
    name: cell(raw.name ?? raw.product_name),
    brand: cell(raw.brand),
    kind: normalizedToken(raw.kind) as CatalogImportProduct["kind"],
    category: normalizedToken(raw.category) as CatalogImportProduct["category"],
    color: cell(raw.color),
    current_price: parsePrice(raw.current_price ?? raw.price),
    original_price: parsePrice(raw.original_price),
    currency: (cell(raw.currency).toUpperCase() || "USD") as CatalogImportProduct["currency"],
    retailer: cell(raw.retailer),
    buy_url: cell(raw.buy_url ?? raw.product_url),
    image_url: cell(raw.image_url ?? raw.product_image_source),
    image_rights_basis: normalizedToken(
      raw.image_rights_basis,
    ) as CatalogImportProduct["image_rights_basis"],
    source_type: normalizedToken(raw.source_type) as CatalogImportProduct["source_type"],
    source_name: cell(raw.source_name),
    source_url: optionalText(raw.source_url),
    verification_method: normalizedToken(
      raw.verification_method,
    ) as CatalogImportProduct["verification_method"],
    availability: normalizedToken(raw.availability) as CatalogImportProduct["availability"],
    external_id: optionalText(raw.external_id ?? raw.external_product_id),
    affiliate: parseBoolean(raw.affiliate) ?? false,
    affiliate_disclosure: optionalText(raw.affiliate_disclosure),
    vibe: cell(raw.vibe),
    price_tier: normalizedToken(raw.price_tier) as CatalogImportProduct["price_tier"],
    accessory_subtype: (optionalText(raw.accessory_subtype)
      ? normalizedToken(raw.accessory_subtype)
      : "") as CatalogImportProduct["accessory_subtype"],
    fragrance_family: (optionalText(raw.fragrance_family)
      ? normalizedToken(raw.fragrance_family)
      : "") as CatalogImportProduct["fragrance_family"],
    description: cell(raw.description),
    material: optionalText(raw.material),
    fit: optionalText(raw.fit),
    available_sizes: parseSizes(raw.available_sizes ?? raw.sizes),
    source_updated_at: optionalText(raw.source_updated_at ?? raw.last_source_update),
    formality: (normalizedToken(raw.formality) || "casual") as CatalogImportProduct["formality"],
    season: (normalizedToken(raw.season) || "all") as CatalogImportProduct["season"],
    condition: (normalizedToken(raw.condition) || "new") as CatalogImportProduct["condition"],
  };
}

function issueText(issue: z.ZodIssue): string {
  const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${field}${issue.message}`;
}

export function validateCatalogImportRecord(
  raw: Record<string, unknown>,
  rowNumber = 1,
  now = Date.now(),
): ValidatedCatalogImportRow {
  const normalized = normalizeRawProduct(raw);
  const errors: string[] = [];

  if (cell(raw.verified_at) || cell(raw.last_checked_at)) {
    errors.push("Imports cannot set verified_at or last_checked_at");
  }
  if (/^20000000-0000-4000-8000-0000000000(?:0[1-9]|[1-4][0-9]|5[01])$/i.test(cell(raw.id))) {
    errors.push("A real product cannot reference a protected Phase 2 demo ID");
  }
  if (cell(normalized.image_url).startsWith("/catalog/phase-2/")) {
    errors.push("A real product cannot reference a protected Phase 2 demo image");
  }

  const parsed = catalogImportProductSchema.safeParse(normalized);
  if (!parsed.success) errors.push(...parsed.error.issues.map(issueText));

  const warnings: string[] = [];
  if (!normalized.external_id) warnings.push("No external product ID was supplied");
  if (!normalized.source_updated_at) warnings.push("No source update timestamp was supplied");
  if (normalized.available_sizes?.length === 0) warnings.push("No available sizes were supplied");
  if (normalized.source_updated_at) {
    const sourceTime = Date.parse(normalized.source_updated_at);
    if (!Number.isNaN(sourceTime) && now - sourceTime > 1000 * 60 * 60 * 24 * 30) {
      warnings.push("The source update timestamp is more than 30 days old");
    }
  }

  return {
    rowNumber,
    raw,
    normalized: parsed.success ? parsed.data : normalized,
    errors: [...new Set(errors)],
    warnings,
  };
}

/** RFC 4180-style parser with escaped quotes and CRLF support. */
export function parseCsvRecords(content: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value");
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((cells) => cells.some((item) => item.trim().length > 0));
  if (nonEmptyRows.length < 2) throw new Error("CSV must include a header and at least one row");
  const headers = nonEmptyRows[0].map((header) => normalizedToken(header));
  if (headers.some((header) => !header)) throw new Error("CSV headers cannot be blank");
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique");

  return nonEmptyRows
    .slice(1)
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
    );
}

export function parseJsonRecords(content: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(content);
  const rows = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { products?: unknown }).products)
      ? (parsed as { products: unknown[] }).products
      : null;
  if (!rows || rows.length === 0)
    throw new Error("JSON must be a non-empty array or { products: [] }");
  if (rows.some((row) => typeof row !== "object" || row === null || Array.isArray(row))) {
    throw new Error("Every imported JSON row must be an object");
  }
  return rows as Record<string, unknown>[];
}

export function parseCatalogImport(
  content: string,
  format: CatalogImportFormat,
): ValidatedCatalogImportRow[] {
  if (content.length > 1_000_000) throw new Error("Import files must be 1 MB or smaller");
  const records = format === "csv" ? parseCsvRecords(content) : parseJsonRecords(content);
  if (records.length > 500) throw new Error("A batch may contain at most 500 products");
  return records.map((record, index) => validateCatalogImportRecord(record, index + 1));
}

export function normalizeProductUrl(value: unknown): string {
  if (!isValidHttpsUrl(value)) return "";
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || ["ref", "affiliate", "aff"].includes(key)) {
      url.searchParams.delete(key);
    }
  }
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function identityPart(value: unknown): string {
  return cell(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function externalIdentity(item: Partial<CatalogImportProduct> | ExistingCatalogIdentity): string {
  const retailer = identityPart(item.retailer);
  const external = identityPart(item.external_id);
  return retailer && external ? `${retailer}|${external}` : "";
}

function descriptiveIdentity(
  item: Partial<CatalogImportProduct> | ExistingCatalogIdentity,
): string {
  return [item.brand, item.name, item.color, item.retailer].map(identityPart).join("|");
}

export function planCatalogImportRows(
  rows: ValidatedCatalogImportRow[],
  existing: ExistingCatalogIdentity[],
): PlannedCatalogImportRow[] {
  const existingExternal = new Map<string, ExistingCatalogIdentity>(
    existing.flatMap((item) => {
      const key = externalIdentity(item);
      return key ? ([[key, item]] as Array<[string, ExistingCatalogIdentity]>) : [];
    }),
  );
  const existingUrl = new Map<string, ExistingCatalogIdentity>(
    existing.flatMap((item) => {
      const key = normalizeProductUrl(item.buy_url);
      return key ? ([[key, item]] as Array<[string, ExistingCatalogIdentity]>) : [];
    }),
  );
  const existingDescription = new Map(existing.map((item) => [descriptiveIdentity(item), item]));
  const seenExternal = new Set<string>();
  const seenUrls = new Set<string>();
  const seenDescriptions = new Map<string, number>();

  return rows.map((row) => {
    if (row.errors.length > 0) return { ...row, action: "manual_review" as const };

    const externalKey = externalIdentity(row.normalized);
    const productUrl = normalizeProductUrl(row.normalized.buy_url);
    const descriptionKey = descriptiveIdentity(row.normalized);
    if (
      (externalKey && seenExternal.has(externalKey)) ||
      (productUrl && seenUrls.has(productUrl))
    ) {
      return {
        ...row,
        action: "skip" as const,
        duplicateReason: "Exact duplicate of an earlier row in this batch",
      };
    }
    if (externalKey) seenExternal.add(externalKey);
    if (productUrl) seenUrls.add(productUrl);
    const earlierDescriptionRow = seenDescriptions.get(descriptionKey);
    if (descriptionKey && earlierDescriptionRow !== undefined) {
      return {
        ...row,
        action: "manual_review" as const,
        duplicateReason: `Brand, name, color, and retailer match batch row ${earlierDescriptionRow}`,
      };
    }
    if (descriptionKey) seenDescriptions.set(descriptionKey, row.rowNumber);

    const exact = (externalKey && existingExternal.get(externalKey)) || existingUrl.get(productUrl);
    if (exact) {
      if (exact.is_demo) {
        return {
          ...row,
          action: "manual_review" as const,
          duplicateReason: "The source identity conflicts with a protected demo row",
        };
      }
      return {
        ...row,
        action: "update" as const,
        catalogId: exact.id,
        duplicateReason: externalKey
          ? "Matches an existing retailer and external product ID"
          : "Matches an existing normalized product URL",
      };
    }

    const possible = existingDescription.get(descriptionKey);
    if (possible) {
      return {
        ...row,
        action: "manual_review" as const,
        catalogId: possible.id,
        duplicateReason: "Brand, name, color, and retailer match an existing product",
      };
    }

    return { ...row, action: "create" as const };
  });
}
