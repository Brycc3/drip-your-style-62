import { describe, expect, it } from "bun:test";
import crypto from "node:crypto";
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
const canonicalizationFixtures = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/fixtures/product-url-canonicalization.json"), "utf8"),
) as Array<{ name: string; input: string; expected: string }>;

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
  it("keeps the applied Lovable migration byte-for-byte identical to main", () => {
    const applied = fs.readFileSync(
      path.join(
        ROOT,
        "supabase/migrations/20260730025301_cb455320-3ddc-42d0-894e-6a7e610dcc9b.sql",
      ),
    );
    expect(crypto.createHash("sha256").update(applied).digest("hex")).toBe(
      "b78d464dc0feb701692ae1b03eed3aba5d8f5985a48da29f90856ef4ddbe8de1",
    );
    expect(source("supabase/compatibility/20260730025301_clean_replay.sql")).toContain(
      "DROP FUNCTION public.attach_problem_report_screenshot(uuid, text)",
    );
  });

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

  it("uses the shared canonical product URL identities without collapsing variants", () => {
    for (const fixture of canonicalizationFixtures) {
      expect(normalizeProductUrl(fixture.input), fixture.name).toBe(fixture.expected);
    }
    const firstVariant = canonicalizationFixtures.find(
      ({ name }) => name === "first product variant",
    );
    const secondVariant = canonicalizationFixtures.find(
      ({ name }) => name === "different product variant",
    );
    expect(firstVariant?.expected).not.toBe(secondVariant?.expected);
    expect(migration).toContain("public.catalog_query_component_decode");
    expect(migration).toContain("public.catalog_query_component_encode");
    expect(migration).toContain("normalized_key IN ('ref', 'affiliate', 'aff')");
  });

  it("flags same-description batch identities even when URLs and external IDs differ", () => {
    const rows = [
      validateCatalogImportRecord(validRaw({ external_id: "one" }), 1),
      validateCatalogImportRecord(
        validRaw({
          external_id: "two",
          buy_url: "https://shop.example.test/products/field-coat-second-listing",
        }),
        2,
      ),
    ];
    const planned = planCatalogImportRows(rows, []);
    expect(planned.map((row) => row.action)).toEqual(["create", "manual_review"]);
    expect(planned[1].duplicateReason).toContain("batch row 1");
  });

  it("replanning detects a duplicate created by a correction", () => {
    const initiallyDistinct = [
      validateCatalogImportRecord(validRaw({ external_id: "one" }), 1),
      validateCatalogImportRecord(
        validRaw({
          name: "Different Test Coat",
          external_id: "two",
          buy_url: "https://shop.example.test/products/different",
        }),
        2,
      ),
    ];
    expect(planCatalogImportRows(initiallyDistinct, []).map((row) => row.action)).toEqual([
      "create",
      "create",
    ]);
    const corrected = [
      initiallyDistinct[0],
      validateCatalogImportRecord(
        validRaw({
          external_id: "two",
          buy_url: "https://shop.example.test/products/different",
        }),
        2,
      ),
    ];
    expect(planCatalogImportRows(corrected, []).map((row) => row.action)).toEqual([
      "create",
      "manual_review",
    ]);
  });

  it("replanning clears a descriptive duplicate after a correction", () => {
    const duplicated = [
      validateCatalogImportRecord(validRaw({ external_id: "one" }), 1),
      validateCatalogImportRecord(
        validRaw({
          external_id: "two",
          buy_url: "https://shop.example.test/products/second",
        }),
        2,
      ),
    ];
    expect(planCatalogImportRows(duplicated, [])[1].action).toBe("manual_review");
    const corrected = [
      duplicated[0],
      validateCatalogImportRecord(
        validRaw({
          name: "Corrected Distinct Test Coat",
          external_id: "two",
          buy_url: "https://shop.example.test/products/second",
        }),
        2,
      ),
    ];
    expect(planCatalogImportRows(corrected, []).map((row) => row.action)).toEqual([
      "create",
      "create",
    ]);
  });

  it("does not count invalid lookalike rows as duplicates", () => {
    const invalidRows = [
      validateCatalogImportRecord(validRaw({ name: "" }), 1),
      validateCatalogImportRecord(validRaw({ name: "" }), 2),
    ];
    const planned = planCatalogImportRows(invalidRows, []);
    expect(planned.every((row) => row.action === "manual_review")).toBe(true);
    expect(planned.filter((row) => row.duplicateReason).length).toBe(0);
  });

  it("derives duplicate counts from duplicate reasons, not all non-create actions", () => {
    const rows = [
      validateCatalogImportRecord(validRaw({ name: "" }), 1),
      validateCatalogImportRecord(validRaw({ external_id: "one" }), 2),
      validateCatalogImportRecord(
        validRaw({
          external_id: "two",
          buy_url: "https://shop.example.test/products/other-url",
        }),
        3,
      ),
    ];
    const planned = planCatalogImportRows(rows, []);
    expect(planned.filter((row) => row.action !== "create").length).toBe(2);
    expect(planned.filter((row) => row.duplicateReason).length).toBe(1);
  });

  it("imports approved products atomically as real, active, and unverified", () => {
    const importer = sqlFunction("private_import_catalog_batch");
    expect(importer).toContain("SECURITY DEFINER");
    expect(importer).toContain("is_demo, archived, verified_at, last_checked_at");
    expect(importer).toContain("false, false, NULL, NULL");
    expect(importer).toContain("'verified', false");
    expect(importer).toContain("AND is_demo = false");
    expect(importer).toContain("pg_advisory_xact_lock");
    expect(importer.indexOf("PERFORM public.assert_valid_catalog_import_product")).toBeLessThan(
      importer.indexOf("INSERT INTO public.shop_catalog"),
    );
  });

  it("requires administrator authorization on every import server operation", () => {
    const server = source("src/lib/catalog-import.functions.ts");
    const exportedOperations = (server.match(/export const \w+ = createServerFn/g) ?? []).length;
    const adminChecks = (server.match(/await requireServerAdmin\(/g) ?? []).length;
    expect(exportedOperations).toBe(10);
    expect(adminChecks).toBe(exportedOperations);
    expect(migration).toContain("USING (public.is_admin(auth.uid()))");
  });
});

describe("Phase 4A import reconciliation blockers", () => {
  it("replans every open row and clears stale decisions after a correction", () => {
    const replan = sqlFunction("replan_catalog_import_batch");
    const correction = sqlFunction("update_catalog_import_row_and_replan");
    expect(replan).toContain("review_status NOT IN ('imported', 'rejected', 'skipped')");
    expect(replan).toContain("resolution_action = NULL");
    expect(replan).toContain("review_status = 'pending'");
    expect(correction).toContain("PERFORM public.replan_catalog_import_batch(batch_id)");
    expect(migration).toContain("count(*)::integer");
    expect(migration).toContain("duplicate_reason IS NOT NULL");
  });

  it("keeps create, update, and skip resolutions separate from approval", () => {
    const resolution = sqlFunction("resolve_catalog_import_row");
    const review = sqlFunction("review_catalog_import_row");
    expect(resolution).toContain("_action NOT IN ('create', 'update', 'skip')");
    expect(resolution).toContain("requires explicit confirmation");
    expect(resolution).toContain("valid non-demo catalog target");
    expect(resolution).toContain("resolved_by = caller");
    expect(review).toContain("staged.resolution_action IS NULL");
    expect(review).toContain("Resolve validation and duplicate-review issues before approval");
  });

  it("stages batch metadata and all rows in one database transaction", () => {
    const stage = sqlFunction("stage_catalog_import_batch");
    const server = source("src/lib/catalog-import.functions.ts");
    expect(stage).toContain("INSERT INTO public.catalog_import_batches");
    expect(stage).toContain("INSERT INTO public.catalog_import_rows");
    expect(stage).toContain("PERFORM public.replan_catalog_import_batch(batch_id)");
    expect(server).toContain('.rpc("stage_catalog_import_batch"');
    expect(server).not.toContain('.from("catalog_import_batches").insert');
  });

  it("models partial imports and leaves terminal rows untouched on repeat runs", () => {
    const lifecycle = sqlFunction("refresh_catalog_import_batch_lifecycle");
    const importer = sqlFunction("private_import_catalog_batch");
    expect(migration).toContain("'partially_imported'");
    expect(lifecycle).toContain("review_status IN ('imported', 'rejected', 'skipped')");
    expect(importer).toContain("review_status = 'approved'");
    expect(importer).toContain("review_status = 'skipped'");
    expect(importer).toContain("'remaining', remaining_count");
  });

  it("rechecks live and intra-batch identities under a global transaction lock", () => {
    const importer = sqlFunction("private_import_catalog_batch");
    expect(importer).toContain("pg_advisory_xact_lock");
    expect(importer).toContain("prior.row_number < staged.row_number");
    expect(importer).toContain("FROM public.shop_catalog product");
    expect(importer).toContain("FOR UPDATE");
    expect(importer).toContain("review_status = 'pending'");
    expect(importer).toContain("'blocked', true");
  });

  it("duplicates all application checks in the final database assertion", () => {
    const assertion = sqlFunction("assert_valid_catalog_import_product");
    for (const requirement of [
      "protected catalog control fields",
      "Imported text fields must be strings",
      "Imported price fields must be numbers",
      "Imported product text exceeds supported limits",
      "available sizes",
      "current price",
      "product image rights",
      "category and kind",
      "accessory subtype",
      "fragrance family",
      "Affiliate imports require a disclosure",
    ]) {
      expect(assertion).toContain(requirement);
    }
  });

  it("revokes direct import-table mutations and exposes admin RPCs instead", () => {
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.catalog_import_batches FROM authenticated",
    );
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.catalog_import_rows FROM authenticated",
    );
    expect(migration).not.toContain('CREATE POLICY "catalog imports admin update rows"');
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.resolve_catalog_import_row(uuid, text, uuid, boolean)",
    );
  });

  it("exports import/report/image records and preserves imported products on deletion", () => {
    const account = source("src/lib/account.functions.ts");
    const prepare = sqlFunction("prepare_catalog_import_account_deletion");
    const accountExport = sqlFunction("get_my_catalog_import_export");
    expect(account).toContain('"get_my_catalog_import_export"');
    expect(account).toContain('"prepare_catalog_import_account_deletion"');
    expect(account).toContain('from("catalog-products")');
    expect(account).toContain('from("reports")');
    expect(prepare).toContain("row.review_status = 'imported'");
    expect(prepare).toContain("SET created_by = NULL");
    expect(accountExport).toContain("catalogProductImagePaths");
    expect(accountExport).toContain("reportScreenshotPaths");
  });

  it("binds draft images to owner/batch/row and deletes only unreferenced objects", () => {
    const importsUi = source("src/routes/_authenticated/admin.catalog_.imports.tsx");
    expect(migration).toContain("(storage.foldername(name))[2] = auth.uid()::text");
    expect(migration).toContain("row.normalized_data->>'image_url'");
    expect(migration).toContain("product.image_url LIKE");
    expect(importsUi).toContain("cleanupUploadedPath");
    expect(importsUi).toContain("catalogStoragePath");
    expect(importsUi).toContain("Correction saved, but the prior image could not be cleaned up");
  });

  it("runs a migration-backed PostgreSQL behavior suite in CI", () => {
    const workflow = source(".github/workflows/ci.yml");
    const databaseVerifier = source("scripts/verify-phase4a-database-path.sh");
    expect(workflow).toContain("database-integration:");
    expect(workflow).toContain("verify-phase4a-database-path.sh fresh");
    expect(workflow).toContain("verify-phase4a-database-path.sh existing-upgrade");
    expect(databaseVerifier).toContain("supabase db reset --local");
    expect(databaseVerifier).toContain("supabase migration repair");
    expect(databaseVerifier).toContain("supabase migration up --local");
    expect(databaseVerifier).toContain("phase-4a-integration.sql");
    expect(databaseVerifier).toContain("local-storage-api.mjs upload reports");
    expect(databaseVerifier).toContain("local-storage-api.mjs remove reports");
    expect(databaseVerifier).toContain("phase-4a-account-deletion.sql");
    expect(databaseVerifier).toContain("phase-4a-storage-cleanup-finalize.sql");
  });

  it("deploys one authoritative importer, validation function, and storage policy set", () => {
    expect(
      migration.match(/^CREATE OR REPLACE FUNCTION public\.import_catalog_batch\(/gm) ?? [],
    ).toHaveLength(1);
    expect(
      migration.match(/^CREATE OR REPLACE FUNCTION public\.private_import_catalog_batch\(/gm) ?? [],
    ).toHaveLength(1);
    expect(
      migration.match(
        /^CREATE OR REPLACE FUNCTION public\.assert_valid_catalog_import_product\(/gm,
      ) ?? [],
    ).toHaveLength(1);
    expect(
      migration.match(/^CREATE POLICY "catalog product images admin upload"/gm) ?? [],
    ).toHaveLength(1);
    expect(migration).not.toContain('CREATE POLICY "catalog imports admin insert rows"');
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

  it("preserves the approved onboarding, Home, recovery, reporting, and account boundaries", () => {
    const home = source("src/routes/_authenticated/home.tsx");
    const starter = source("src/lib/starter-progress.ts");
    const recovery = source("src/routes/auth_.reset-password.tsx");
    const problemReport = source("src/components/ProblemReportDialog.tsx");
    const account = source("src/lib/account.functions.ts");

    expect(starter).toContain('{ key: "tops", label: "Tops", have: counts.tops, need: 3 }');
    expect(starter).toContain(
      '{ key: "bottoms", label: "Bottoms", have: counts.bottoms, need: 2 }',
    );
    expect(starter).toContain('{ key: "shoes", label: "Shoes", have: counts.shoes, need: 2 }');
    expect(starter).toContain("generatorReady: missingCoreCategories.length === 0");
    expect(home.match(/to="\/saved"/g) ?? []).toHaveLength(2);
    expect(home).toContain("progress?.generatorReady &&");
    expect(recovery).toContain("recoveryEventAuthorizes(event)");
    expect(problemReport).toContain("screenshotApproved");
    expect(problemReport).toContain("A screenshot is included only if you select and approve one.");
    expect(account).toContain('"get_my_catalog_import_export"');
    expect(account).toContain('"prepare_catalog_import_account_deletion"');
    expect(account).toContain("auth.admin.deleteUser(userId)");
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
