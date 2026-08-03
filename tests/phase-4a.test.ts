import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeProductUrl,
  parseCsvRecords,
  parseJsonRecords,
  planCatalogImportRows,
  validateCatalogImportRecord,
  type ExistingCatalogIdentity,
} from "../src/lib/catalog-import";
import {
  BACKEND_CONFIGURATION_ERROR,
  backendConfigurationStatus,
  resolvePublicBackendConfiguration,
} from "../src/config/backend-env";

const ROOT = path.resolve(import.meta.dir, "..");
const MIGRATION_PATH = path.join(
  ROOT,
  "supabase/migrations/20260802010000_phase_4a_reconciliation_and_real_catalog_imports.sql",
);
const migration = fs.readFileSync(MIGRATION_PATH, "utf8");

function source(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function sqlFunction(name: string): string {
  const replaceStart = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const createStart = migration.indexOf(`CREATE FUNCTION public.${name}`);
  const start = replaceStart >= 0 ? replaceStart : createStart;
  const end = migration.indexOf("\n$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function validRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Test-only Authorized Field Coat",
    brand: "Test Fixture Brand",
    kind: "clothing",
    category: "coat",
    color: "navy",
    current_price: 180,
    currency: "USD",
    retailer: "Test Fixture Retailer",
    buy_url: "https://shop.example.test/products/field-coat",
    image_url: "https://images.example.test/authorized/field-coat.jpg",
    image_rights_basis: "authorized",
    source_type: "manual",
    source_name: "Authorized test fixture",
    source_url: "https://shop.example.test/source",
    verification_method: "manual",
    availability: "in_stock",
    external_id: "fixture-coat-1",
    affiliate: false,
    vibe: "refined utility",
    price_tier: "mid",
    accessory_subtype: "",
    fragrance_family: "",
    description: "Isolated authorized-product test data; never shipped as catalog inventory.",
    material: "cotton",
    fit: "regular",
    available_sizes: ["S", "M", "L"],
    source_updated_at: "2026-08-01T12:00:00.000Z",
    formality: "smart_casual",
    season: "fall",
    condition: "new",
    ...overrides,
  };
}

describe("Phase 4A forward-only reconciliation", () => {
  it("follows the weak live migration and fails closed unless all 51 demos are intact", () => {
    expect(
      path.basename(MIGRATION_PATH) > "20260730025301_cb455320-3ddc-42d0-894e-6a7e610dcc9b.sql",
    ).toBe(true);
    expect(migration).toContain("protected_demo_count <> 51");
    expect(migration).toContain("invalid_demo_count <> 0");
    expect(migration).toContain("source = 'phase_2_curated_demo'");
    expect(migration).toContain("^/catalog/phase-2/");
  });

  it("makes demos immutable and removes browser catalog deletion", () => {
    const protection = sqlFunction("protect_demo_catalog_rows");
    expect(protection).toContain("OLD.is_demo = true");
    expect(protection).toContain("OLD.source = 'phase_2_curated_demo'");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON public.shop_catalog");
    expect(migration).toContain('DROP POLICY IF EXISTS "catalog admin delete"');
    expect(migration).not.toMatch(/CREATE POLICY "catalog admin delete"/);
  });

  it("atomically invalidates verification for every critical catalog edit", () => {
    const guard = sqlFunction("protect_catalog_verification_timestamps");
    for (const field of [
      "name",
      "brand",
      "category",
      "kind",
      "color",
      "retailer",
      "buy_url",
      "image_url",
      "current_price",
      "original_price",
      "availability",
      "source_type",
      "source_name",
      "source_url",
      "image_rights_basis",
      "verification_method",
      "affiliate",
      "affiliate_disclosure",
      "accessory_subtype",
      "fragrance_family",
      "vibe",
      "price_tier",
    ]) {
      expect(guard).toContain(`OLD.${field} IS DISTINCT FROM NEW.${field}`);
    }
    expect(guard).toContain("NEW.verified_at := NULL");
    expect(guard).toContain("NEW.last_checked_at := NULL");
  });

  it("preserves verification for description, material, and fit-only edits", () => {
    const guard = sqlFunction("protect_catalog_verification_timestamps");
    expect(guard).not.toContain("OLD.description IS DISTINCT FROM NEW.description");
    expect(guard).not.toContain("OLD.material IS DISTINCT FROM NEW.material");
    expect(guard).not.toContain("OLD.fit IS DISTINCT FROM NEW.fit");
  });

  it("requires re-verification when restocking or restoring", () => {
    const guard = sqlFunction("protect_catalog_verification_timestamps");
    expect(guard).toContain("OLD.availability IS DISTINCT FROM NEW.availability");
    expect(guard).toContain("OLD.archived IS DISTINCT FROM NEW.archived");
  });

  it("blocks direct timestamp writes and reserves one server time for Verify", () => {
    const directGuard = sqlFunction("reject_direct_catalog_verification_writes");
    const verify = sqlFunction("verify_shop_catalog_item");
    expect(migration).toContain("REVOKE INSERT (verified_at, last_checked_at)");
    expect(migration).toContain("UPDATE (verified_at, last_checked_at)");
    expect(directGuard).toContain("Use the explicit catalog verification action");
    expect(verify).toContain("SECURITY DEFINER");
    expect(verify).toContain("verified_time timestamptz := now()");
    expect(verify).toContain("SET verified_at = verified_time, last_checked_at = verified_time");
    expect(verify).toContain("Catalog product is incomplete or inconsistent");
  });

  it("keeps report screenshots private and bound to an owned report plus uploaded object", () => {
    const attach = sqlFunction("attach_problem_report_screenshot");
    expect(migration).toContain("report.reporter_id = auth.uid()");
    expect(migration).toContain("SET public = false");
    expect(attach).toContain("FROM storage.objects WHERE bucket_id = 'reports'");
    expect(attach).toContain("WHERE id = _report AND reporter_id = caller");
  });

  it("ships a SELECT-only production preflight", () => {
    const preflight = source("supabase/preflight/phase-4a-read-only-preflight.sql");
    const withoutComments = preflight.replace(/^--.*$/gm, "").trim();
    const statements = withoutComments.split(";").filter((statement) => statement.trim());
    expect(statements.every((statement) => /^\s*SELECT\b/i.test(statement))).toBe(true);
    expect(preflight).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i);
  });
});

describe("Phase 4A real-product staging", () => {
  it("parses quoted CSV and JSON product collections", () => {
    expect(parseCsvRecords('name,description\r\n"Coat, Navy","A ""quoted"" note"\r\n')).toEqual([
      { name: "Coat, Navy", description: 'A "quoted" note' },
    ]);
    expect(parseJsonRecords('{"products":[{"name":"Test coat"}]}')).toEqual([
      { name: "Test coat" },
    ]);
  });

  it("enforces required text and HTTPS product/image URLs", () => {
    expect(validateCatalogImportRecord(validRaw()).errors).toEqual([]);
    expect(validateCatalogImportRecord(validRaw({ name: "" })).errors.join(" ")).toContain("name");
    expect(
      validateCatalogImportRecord(validRaw({ buy_url: "http://shop.example.test/item" }))
        .errors.join(" ")
        .toLowerCase(),
    ).toContain("https");
    expect(
      validateCatalogImportRecord(validRaw({ image_url: "http://images.example.test/item.jpg" }))
        .errors.join(" ")
        .toLowerCase(),
    ).toContain("image");
  });

  it("enforces image rights, affiliate disclosure, and category-kind agreement", () => {
    expect(
      validateCatalogImportRecord(validRaw({ image_rights_basis: "project_owned" })).errors.length,
    ).toBeGreaterThan(0);
    expect(
      validateCatalogImportRecord(validRaw({ affiliate: true, affiliate_disclosure: "" }))
        .errors.join(" ")
        .toLowerCase(),
    ).toContain("disclosure");
    expect(validateCatalogImportRecord(validRaw({ kind: "shoes" })).errors.join(" ")).toContain(
      "kind=clothing",
    );
  });

  it("rejects staged timestamps and protected Phase 2 identities or images", () => {
    expect(
      validateCatalogImportRecord(validRaw({ verified_at: "2026-08-01T00:00:00Z" })).errors,
    ).toContain("Imports cannot set verified_at or last_checked_at");
    expect(
      validateCatalogImportRecord(
        validRaw({ id: "20000000-0000-4000-8000-000000000051" }),
      ).errors.join(" "),
    ).toContain("protected Phase 2 demo ID");
    expect(
      validateCatalogImportRecord(validRaw({ image_url: "/catalog/phase-2/test.svg" })).errors.join(
        " ",
      ),
    ).toContain("protected Phase 2 demo image");
  });

  it("normalizes product URLs and detects create, update, skip, and manual-review decisions", () => {
    expect(
      normalizeProductUrl("https://SHOP.example.test/products/coat/?utm_source=test#details"),
    ).toBe("https://shop.example.test/products/coat");

    const existing: ExistingCatalogIdentity[] = [
      {
        id: "existing-source",
        external_id: "fixture-coat-1",
        retailer: "Test Fixture Retailer",
        buy_url: "https://shop.example.test/products/field-coat",
        brand: "Test Fixture Brand",
        name: "Test-only Authorized Field Coat",
        color: "navy",
        is_demo: false,
      },
      {
        id: "possible-match",
        retailer: "Fixture Outlet",
        buy_url: "https://outlet.example.test/products/old",
        brand: "Fixture House",
        name: "Test-only Layer",
        color: "black",
        is_demo: false,
      },
    ];
    const rows = [
      validateCatalogImportRecord(validRaw()),
      validateCatalogImportRecord(
        validRaw({ buy_url: "https://shop.example.test/products/field-coat?utm_medium=test" }),
        2,
      ),
      validateCatalogImportRecord(
        validRaw({
          external_id: "",
          brand: "Fixture House",
          name: "Test-only Layer",
          color: "black",
          retailer: "Fixture Outlet",
          buy_url: "https://outlet.example.test/products/new",
        }),
        3,
      ),
      validateCatalogImportRecord(
        validRaw({
          external_id: "new-4",
          name: "Test-only New Coat",
          buy_url: "https://shop.example.test/products/new-coat",
        }),
        4,
      ),
    ];
    expect(planCatalogImportRows(rows, existing).map((row) => row.action)).toEqual([
      "update",
      "skip",
      "manual_review",
      "create",
    ]);
  });

  it("imports approved products atomically as real, active, and unverified", () => {
    const importer = sqlFunction("import_catalog_batch");
    expect(importer).toContain("SECURITY DEFINER");
    expect(importer).toContain("is_demo, archived, verified_at, last_checked_at");
    expect(importer).toContain("false, false, NULL, NULL");
    expect(importer).toContain("'verified', false");
    expect(importer).toContain("AND is_demo = false");
  });

  it("requires administrator authorization on every import server operation", () => {
    const server = source("src/lib/catalog-import.functions.ts");
    const exportedOperations = (server.match(/export const \w+ = createServerFn/g) ?? []).length;
    const adminChecks = (server.match(/await requireServerAdmin\(/g) ?? []).length;
    expect(exportedOperations).toBe(8);
    expect(adminChecks).toBe(exportedOperations);
    expect(migration).toContain("USING (public.is_admin(auth.uid()))");
  });
});

describe("Phase 4A UX and pipeline guardrails", () => {
  it("uses Verified as Shop default and preserves an isolated Demo scope", () => {
    const shop = source("src/routes/_authenticated/shop.tsx");
    expect(shop).toContain('useState<ShopScope>("verified")');
    expect(shop).toContain('l: "Demo concepts"');
    expect(shop).toContain(
      "Verified products will appear after authorized retailer, affiliate, partner, or manually",
    );
  });

  it("returns a controlled value-safe backend configuration error", () => {
    expect(backendConfigurationStatus({})).toEqual({
      ok: false,
      missing: ["url", "publishable_key"],
    });
    expect(() => resolvePublicBackendConfiguration({})).toThrow(BACKEND_CONFIGURATION_ERROR);
    expect(BACKEND_CONFIGURATION_ERROR).toBe(
      "Sign-in is temporarily unavailable because the backend configuration is missing.",
    );
    expect(
      backendConfigurationStatus({
        SUPABASE_URL: "https://project.example.test",
        SUPABASE_PUBLISHABLE_KEY: "test-public-placeholder",
      }),
    ).toEqual({ ok: true });
    expect(
      backendConfigurationStatus({
        SUPABASE_URL: "https://project.example.test",
        SUPABASE_PUBLISHABLE_KEY: "sb_secret_test-only-placeholder",
      }),
    ).toEqual({ ok: false, missing: ["publishable_key"] });
  });

  it("defines the required CI checks with public placeholders only", () => {
    const workflow = source(".github/workflows/ci.yml");
    expect(workflow).toContain("node-version: 24");
    for (const command of [
      "npm ci",
      "npm run format:check",
      "npm run typecheck",
      "npm run lint",
      "bun test",
      "npm run build",
      "npm run catalog:check",
      "git ls-files .env",
      "npm run secrets:check",
      "npm run secrets:history",
    ]) {
      expect(workflow).toContain(command);
    }
    expect(workflow).not.toContain("SERVICE_ROLE");
    expect(workflow).not.toContain("sb_secret_");
  });
});
