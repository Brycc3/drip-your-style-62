import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { assertAdminAuthorized } from "../src/lib/admin-auth";
import {
  CATALOG_ACCESSORY_SUBTYPES,
  assertCatalogRowWritable,
  buildCatalogPayload,
  buildNewCatalogPayload,
  catalogAddSchema,
  deriveCatalogKind,
  type CatalogAddInput,
} from "../src/lib/catalog-validation";
import {
  catalogMatchesScope,
  rankCatalogForScope,
  shouldShowVerifiedInventoryEmpty,
  type VerifiableCatalogItem,
} from "../src/lib/shop-catalog";
import {
  attachmentPath,
  buildProblemReportDetails,
  buildSafeReportMeta,
  problemReportType,
  screenshotIsApproved,
} from "../src/lib/report-attachment";
import {
  parseRecoveryCallback,
  recoveryEventAuthorizes,
  validateNewPassword,
} from "../src/lib/reset-password-guard";
import { computeStarterProgress, starterCountsFromItems } from "../src/lib/starter-progress";

const NOW = Date.parse("2026-07-29T18:00:00.000Z");
const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const PASS_3_MIGRATION = path.join(
  PROJECT_ROOT,
  "supabase/migrations/20260729220000_pass_3_security_and_beta_repair.sql",
);

function pass3Sql(): string {
  return fs.readFileSync(PASS_3_MIGRATION, "utf8");
}

function sqlFunction(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = source.indexOf("\n$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

function product(
  id: string,
  overrides: Partial<VerifiableCatalogItem> = {},
): VerifiableCatalogItem {
  return {
    id,
    name: `Product ${id}`,
    brand: "Authorized Brand",
    kind: "clothing",
    category: "top",
    color: "black",
    price: 100,
    current_price: 100,
    currency: "USD",
    condition: "new",
    image_url: "https://authorized.example/product.jpg",
    formality: "casual",
    season: "all",
    retailer: "Authorized Retailer",
    buy_url: "https://authorized.example/product",
    availability: "in_stock",
    last_checked_at: new Date(NOW - 60_000).toISOString(),
    is_demo: false,
    source_type: "manual",
    source_name: "Retailer product page",
    source_url: "https://authorized.example/product",
    image_rights_basis: "authorized",
    verified_at: new Date(NOW - 60_000).toISOString(),
    verification_method: "manual",
    affiliate: false,
    ...overrides,
  };
}

const validCatalogInput: CatalogAddInput = {
  name: "Authorized Field Jacket",
  brand: "Authorized Brand",
  category: "jacket",
  kind: "clothing",
  color: "olive",
  material: "cotton",
  fit: "regular",
  formality: "casual",
  season: "all",
  condition: "new",
  retailer: "Authorized Retailer",
  buy_url: "https://authorized.example/field-jacket",
  image_url: "https://cdn.authorized.example/field-jacket.jpg",
  current_price: 145,
  currency: "USD",
  availability: "in_stock",
  source_type: "manual",
  source_name: "Retailer product page",
  source_url: "https://authorized.example/field-jacket",
  image_rights_basis: "authorized",
  verification_method: "manual",
  vibe: "workwear",
  price_tier: "mid",
  accessory_subtype: "",
  fragrance_family: "",
  affiliate: false,
  affiliate_disclosure: "",
  description: "An authorized product fixture.",
};

describe("Pass 3 Shop scopes", () => {
  const verified = product("verified");
  const demo = product("demo", {
    is_demo: true,
    retailer: null,
    buy_url: null,
    availability: "sample_only",
    source_type: null,
    verified_at: null,
    last_checked_at: null,
  });
  const incomplete = product("incomplete", {
    is_demo: false,
    source_name: null,
  });
  const scored = [{ item: demo }, { item: incomplete }, { item: verified }];

  it("ranks verified products before demos and incomplete rows in All", () => {
    expect(rankCatalogForScope(scored, "all", NOW).map(({ item }) => item.id)).toEqual([
      "verified",
      "demo",
      "incomplete",
    ]);
  });

  it("Verified excludes demos and incomplete non-demo rows", () => {
    expect(rankCatalogForScope(scored, "verified", NOW).map(({ item }) => item.id)).toEqual([
      "verified",
    ]);
    expect(catalogMatchesScope(demo, "verified", NOW)).toBe(false);
  });

  it("Demo contains only demo rows", () => {
    expect(rankCatalogForScope(scored, "demo", NOW).map(({ item }) => item.id)).toEqual(["demo"]);
  });

  it("prioritizes verified inventory emptiness inside every Shop tab", () => {
    expect(shouldShowVerifiedInventoryEmpty("verified", 0)).toBe(true);
    expect(shouldShowVerifiedInventoryEmpty("verified", 1)).toBe(false);
    expect(shouldShowVerifiedInventoryEmpty("demo", 0)).toBe(false);
  });
});

describe("catalog server policy helpers", () => {
  it("validates required catalog provenance and commerce fields", () => {
    expect(catalogAddSchema.safeParse(validCatalogInput).success).toBe(true);
    expect(catalogAddSchema.safeParse({ ...validCatalogInput, source_url: "" }).success).toBe(true);
    expect(buildCatalogPayload({ ...validCatalogInput, source_url: "" }).source_url).toBeNull();
    expect(
      catalogAddSchema.safeParse({
        ...validCatalogInput,
        buy_url: "http://unsafe.example/item",
        current_price: 0,
      }).success,
    ).toBe(false);
    expect(
      catalogAddSchema.safeParse({
        ...validCatalogInput,
        affiliate: true,
        affiliate_disclosure: "",
      }).success,
    ).toBe(false);
  });

  it("keeps all client payloads unable to write verification timestamps", () => {
    const editPayload = buildCatalogPayload(validCatalogInput);
    expect(editPayload).not.toHaveProperty("verified_at");
    expect(editPayload).not.toHaveProperty("last_checked_at");

    const insertPayload = buildNewCatalogPayload(validCatalogInput);
    expect(insertPayload).not.toHaveProperty("verified_at");
    expect(insertPayload).not.toHaveProperty("last_checked_at");
    expect(insertPayload.is_demo).toBe(false);
  });

  it("validates intelligence fields, accessory coverage, and derived kind", () => {
    expect(deriveCatalogKind("jacket")).toBe("clothing");
    expect(deriveCatalogKind("runner")).toBe("shoes");
    expect(deriveCatalogKind("bracelet")).toBe("accessory");
    expect(deriveCatalogKind("edp")).toBe("fragrance");

    expect(catalogAddSchema.safeParse({ ...validCatalogInput, kind: "accessory" }).success).toBe(
      false,
    );
    expect(catalogAddSchema.safeParse({ ...validCatalogInput, vibe: "" }).success).toBe(false);
    expect(
      catalogAddSchema.safeParse({ ...validCatalogInput, price_tier: undefined }).success,
    ).toBe(false);

    const requiredSubtypes = [
      "bracelets",
      "grills",
      "glasses",
      "earrings",
      "chains",
      "watches",
      "rings",
      "hat",
      "belts",
      "bags",
      "socks",
      "scarves",
      "wallets",
    ];
    expect(
      requiredSubtypes.every((subtype) => CATALOG_ACCESSORY_SUBTYPES.includes(subtype as never)),
    ).toBe(true);

    const glasses = {
      ...validCatalogInput,
      category: "glasses" as const,
      kind: "accessory" as const,
      accessory_subtype: "glasses" as const,
    };
    expect(catalogAddSchema.safeParse(glasses).success).toBe(true);
    expect(catalogAddSchema.safeParse({ ...glasses, accessory_subtype: "" }).success).toBe(false);

    const fragrance = {
      ...validCatalogInput,
      category: "edp" as const,
      kind: "fragrance" as const,
      fragrance_family: "woody" as const,
    };
    expect(catalogAddSchema.safeParse(fragrance).success).toBe(true);
    expect(catalogAddSchema.safeParse({ ...fragrance, fragrance_family: "" }).success).toBe(false);
  });

  it("protects every demo row and the curated demo source", () => {
    expect(() => assertCatalogRowWritable({ is_demo: true })).toThrow("read-only");
    expect(() =>
      assertCatalogRowWritable({ is_demo: false, source: "phase_2_curated_demo" }),
    ).toThrow("read-only");
    expect(() =>
      assertCatalogRowWritable({ is_demo: false, source: "admin_verified" }),
    ).not.toThrow();
  });

  it("requires server-side admin authorization", () => {
    expect(() => assertAdminAuthorized(false)).toThrow("Admin only");
    expect(() => assertAdminAuthorized(true)).not.toThrow();
  });

  it("ships database-level demo protection without a catalog delete policy", () => {
    const sql = pass3Sql();
    expect(sql).toContain("CREATE TRIGGER protect_demo_catalog_rows");
    expect(sql).toContain("OLD.is_demo = true");
    expect(sql).toContain("AND is_demo = false");
    expect(sql).toContain('DROP POLICY IF EXISTS "catalog admin delete"');
    expect(sql).not.toContain('CREATE POLICY "catalog admin delete"');
    expect(sql).toContain("FUNCTION public.verify_shop_catalog_item");
    expect(sql).toContain("protect_catalog_verification_timestamps");
    expect(sql).toContain("protect_new_catalog_verification_timestamps");
    expect(sql).toContain("AND verified_at IS NULL");
    expect(sql).toContain("AND last_checked_at IS NULL");
  });
});

describe("atomic catalog verification invalidation", () => {
  const sql = pass3Sql();
  const guard = sqlFunction(sql, "protect_catalog_verification_timestamps()");
  const verifyRpc = sqlFunction(sql, "verify_shop_catalog_item(_catalog_id uuid)");

  it("clears both timestamps when any critical or recommendation field changes", () => {
    const criticalFields = [
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
      "formality",
      "season",
      "condition",
    ];
    for (const field of criticalFields) {
      expect(guard).toContain(`OLD.${field} IS DISTINCT FROM NEW.${field}`);
    }
    expect(guard).toContain("IF verification_critical_change THEN");
    expect(guard).toContain("NEW.verified_at := NULL;");
    expect(guard).toContain("NEW.last_checked_at := NULL;");
    expect(sql).toContain(
      "CREATE TRIGGER protect_catalog_verification_timestamps\n  BEFORE UPDATE ON public.shop_catalog",
    );
  });

  it("preserves timestamps for description, material, and fit-only edits", () => {
    expect(guard).not.toContain("OLD.description IS DISTINCT FROM NEW.description");
    expect(guard).not.toContain("OLD.material IS DISTINCT FROM NEW.material");
    expect(guard).not.toContain("OLD.fit IS DISTINCT FROM NEW.fit");
  });

  it("requires reverification after restoring an archived row", () => {
    expect(guard).toContain("OLD.archived IS DISTINCT FROM NEW.archived");
    expect(guard.indexOf("OLD.archived IS DISTINCT FROM NEW.archived")).toBeLessThan(
      guard.indexOf("NEW.verified_at := NULL;"),
    );
  });

  it("requires reverification after restocking an unavailable row", () => {
    expect(guard).toContain("OLD.availability IS DISTINCT FROM NEW.availability");
    expect(guard.indexOf("OLD.availability IS DISTINCT FROM NEW.availability")).toBeLessThan(
      guard.indexOf("NEW.last_checked_at := NULL;"),
    );
  });

  it("rejects direct timestamp writes from browser and SQL paths", () => {
    expect(sql).toContain("REVOKE INSERT, UPDATE ON public.shop_catalog FROM authenticated;");
    expect(sql).toContain("REVOKE INSERT (verified_at, last_checked_at)");
    expect(sql).toContain("UPDATE (verified_at, last_checked_at)");
    expect(sql).toContain(
      "CREATE TRIGGER reject_direct_catalog_verification_writes\n  BEFORE UPDATE OF verified_at, last_checked_at",
    );
    expect(sqlFunction(sql, "reject_direct_catalog_verification_writes()")).toContain(
      "Use the explicit catalog verification action",
    );
  });

  it("lets only explicit Verify restore one non-null server timestamp", () => {
    expect(verifyRpc).toContain("verified_time timestamptz := now();");
    expect(verifyRpc).toContain("SET verified_at = verified_time, last_checked_at = verified_time");
    expect(guard).toContain("NEW.verified_at IS DISTINCT FROM NEW.last_checked_at");
    expect(guard).toContain("Explicit verification must set both timestamps to one server time");
  });
});

describe("password recovery safety", () => {
  it("validates length and matching confirmation", () => {
    expect(validateNewPassword("short", "short")).toEqual({
      ok: false,
      error: "Password must be at least 8 characters",
    });
    expect(validateNewPassword("long-enough", "different").ok).toBe(false);
    expect(validateNewPassword("long-enough", "long-enough")).toEqual({ ok: true });
  });

  it("authorizes only the verified Supabase recovery event", () => {
    expect(recoveryEventAuthorizes("PASSWORD_RECOVERY")).toBe(true);
    expect(recoveryEventAuthorizes("SIGNED_IN")).toBe(false);
    expect(recoveryEventAuthorizes("INITIAL_SESSION")).toBe(false);
  });

  it("never treats fake raw tokens or codes as authorization", () => {
    const fakeImplicit = parseRecoveryCallback(
      "#type=recovery&access_token=fake&refresh_token=fake",
      "",
    );
    const fakePkce = parseRecoveryCallback("", "?type=recovery&code=fake");
    expect(fakeImplicit.hasCallbackParameters).toBe(true);
    expect(fakePkce.hasCallbackParameters).toBe(true);
    expect(fakeImplicit).not.toHaveProperty("authorized");
    expect(fakePkce).not.toHaveProperty("authorized");

    const expired = parseRecoveryCallback(
      "#error=access_denied&error_code=otp_expired&error_description=expired",
      "",
    );
    expect(expired.error).toContain("expired");

    const route = fs.readFileSync(
      path.join(PROJECT_ROOT, "src/routes/auth_.reset-password.tsx"),
      "utf8",
    );
    expect(route).not.toContain("callback.authorized");
    expect(route).toContain("recoveryEventAuthorizes(event)");
  });

  it("keeps the reset page outside the leaf auth component tree", () => {
    const routeTree = fs.readFileSync(path.join(PROJECT_ROOT, "src/routeTree.gen.ts"), "utf8");
    expect(routeTree).toContain("routes/auth_.reset-password");
    expect(routeTree).toMatch(
      /AuthResetPasswordRouteImport\.update\(\{[\s\S]*?getParentRoute: \(\) => rootRouteImport/,
    );
  });
});

describe("starter closet category gating", () => {
  it("counts category subtypes toward the correct 3-2-2 targets", () => {
    const counts = starterCountsFromItems([
      { category: "tee", kind: "clothing" },
      { category: "hoodie", kind: "clothing" },
      { category: "polo", kind: "clothing" },
      { category: "denim", kind: "clothing" },
      { category: "cargos", kind: "clothing" },
      { category: "sneaker", kind: "shoes" },
      { category: "boot", kind: "shoes" },
    ]);
    expect(counts).toEqual({ tops: 3, bottoms: 2, shoes: 2, accessories: 0 });
    expect(computeStarterProgress(counts).complete).toBe(true);
  });

  it("names missing core categories and gates generation until 1/1/1", () => {
    const incomplete = computeStarterProgress({
      tops: 5,
      bottoms: 0,
      shoes: 0,
      accessories: 4,
    });
    expect(incomplete.generatorReady).toBe(false);
    expect(incomplete.missingCoreCategories.map(({ key }) => key)).toEqual(["bottoms", "shoes"]);

    const ready = computeStarterProgress({
      tops: 1,
      bottoms: 1,
      shoes: 1,
      accessories: 0,
    });
    expect(ready.generatorReady).toBe(true);
    expect(ready.complete).toBe(false);
  });

  it("excludes archived closet items and hides the active Home Generate shortcut", () => {
    const counts = starterCountsFromItems([
      { category: "tee", kind: "clothing", archived: true },
      { category: "bottom", kind: "clothing" },
      { category: "shoes", kind: "shoes" },
    ]);
    expect(counts.tops).toBe(0);
    expect(computeStarterProgress(counts).generatorReady).toBe(false);

    const home = fs.readFileSync(
      path.join(PROJECT_ROOT, "src/routes/_authenticated/home.tsx"),
      "utf8",
    );
    expect(home.match(/\.eq\("archived", false\)/g)?.length).toBe(2);
    expect(home).toContain("progress?.generatorReady &&");
  });
});

describe("safe problem reporting", () => {
  it("keeps problem types visible without violating the content target schema", () => {
    expect(problemReportType("other", "problem:bug: Image would not load")).toBe("bug");
    expect(problemReportType("other", "problem:other: General feedback")).toBe("other");
    expect(problemReportType("outfit", "Inappropriate post")).toBe("outfit");

    const source = fs.readFileSync(path.join(PROJECT_ROOT, "src/lib/reports.functions.ts"), "utf8");
    expect(source).toContain('target_type: "other"');
    expect(source).toContain("`problem:${data.report_type}: ${data.description}`");
  });

  it("whitelists metadata and strips query/hash values", () => {
    const unsafe = {
      report_type: "bug" as const,
      description: "Shop failed",
      route: "/shop?access_token=secret#private",
      user_agent: "Browser",
      device: "mobile",
      client_timestamp: "2026-07-29T18:00:00.000Z",
      token: "must-not-survive",
      console_logs: ["private"],
      form_contents: "private",
    };
    const safe = buildSafeReportMeta(unsafe);
    expect(safe.route).toBe("/shop");
    expect(Object.keys(safe)).toEqual([
      "report_type",
      "description",
      "route",
      "user_agent",
      "device",
      "client_timestamp",
      "attachment_path",
    ]);
    expect(JSON.stringify(safe)).not.toContain("must-not-survive");
  });

  it("preserves an accepted 4,000-character description", () => {
    const description = "x".repeat(4000);
    const details = buildProblemReportDetails({
      report_type: "bug",
      description,
      route: "/shop",
    });
    expect(details.endsWith(description)).toBe(true);
    expect(details.length).toBeGreaterThanOrEqual(4000);
  });

  it("requires screenshot consent and creates a report-owned private path", () => {
    expect(screenshotIsApproved(true, false)).toBe(false);
    expect(screenshotIsApproved(false, true)).toBe(false);
    expect(screenshotIsApproved(true, true)).toBe(true);

    const attachmentObjectPath = attachmentPath(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "png",
      "33333333-3333-4333-8333-333333333333",
    );
    expect(attachmentObjectPath).toBe(
      "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png",
    );

    const sql = fs.readFileSync(
      path.join(
        PROJECT_ROOT,
        "supabase/migrations/20260729220000_pass_3_security_and_beta_repair.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE POLICY "reports admin read"');
    expect(sql).toContain("false,\n  5242880");
    expect(sql).toContain("array_length(storage.foldername(name), 1) = 2");
    expect(sql).toContain("storage.filename(name) ~");
    expect(sql).toContain("report.reporter_id = auth.uid()");
    expect(sql).toContain("attach_problem_report_screenshot");

    const dialog = fs.readFileSync(
      path.join(PROJECT_ROOT, "src/components/ProblemReportDialog.tsx"),
      "utf8",
    );
    expect(dialog.indexOf("await createReport")).toBeLessThan(
      dialog.indexOf("await uploadAttachment"),
    );
    expect(dialog).toContain(".remove([attachmentPathValue])");

    const reports = fs.readFileSync(
      path.join(PROJECT_ROOT, "src/lib/reports.functions.ts"),
      "utf8",
    );
    expect(reports).not.toContain("details.slice(0, 2000)");

    const moderation = fs.readFileSync(
      path.join(PROJECT_ROOT, "src/lib/moderation.functions.ts"),
      "utf8",
    );
    expect(moderation).toContain("createSignedUrl(report.attachment_path, 300");
  });
});
