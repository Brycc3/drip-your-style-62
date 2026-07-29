import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { assertAdminAuthorized } from "../src/lib/admin-auth";
import {
  assertCatalogRowWritable,
  buildVerifiedCatalogPayload,
  catalogAddSchema,
  type CatalogAddInput,
} from "../src/lib/catalog-validation";
import {
  catalogMatchesScope,
  rankCatalogForScope,
  type VerifiableCatalogItem,
} from "../src/lib/shop-catalog";
import {
  attachmentPath,
  buildSafeReportMeta,
  problemReportType,
  screenshotIsApproved,
} from "../src/lib/report-attachment";
import {
  isRecoveryUrl,
  parseRecoveryCallback,
  validateNewPassword,
} from "../src/lib/reset-password-guard";
import { computeStarterProgress, starterCountsFromItems } from "../src/lib/starter-progress";

const NOW = Date.parse("2026-07-29T18:00:00.000Z");
const PROJECT_ROOT = path.resolve(import.meta.dir, "..");

function product(
  id: string,
  overrides: Partial<VerifiableCatalogItem> = {},
): VerifiableCatalogItem {
  return {
    id,
    name: `Product ${id}`,
    brand: "Authorized Brand",
    category: "top",
    color: "black",
    price: 100,
    current_price: 100,
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
  availability: "in_stock",
  source_type: "manual",
  source_name: "Retailer product page",
  source_url: "https://authorized.example/field-jacket",
  image_rights_basis: "authorized",
  verification_method: "manual",
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
});

describe("catalog server policy helpers", () => {
  it("validates required catalog provenance and commerce fields", () => {
    expect(catalogAddSchema.safeParse(validCatalogInput).success).toBe(true);
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

  it("sets verification timestamps on the server payload time", () => {
    const now = new Date("2026-07-29T19:00:00.000Z");
    const payload = buildVerifiedCatalogPayload(validCatalogInput, now);
    expect(payload.verified_at).toBe(now.toISOString());
    expect(payload.last_checked_at).toBe(now.toISOString());
    expect(payload.is_demo).toBe(false);
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
    const sql = fs.readFileSync(
      path.join(
        PROJECT_ROOT,
        "supabase/migrations/20260729220000_pass_3_security_and_beta_repair.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("CREATE TRIGGER protect_demo_catalog_rows");
    expect(sql).toContain("OLD.is_demo = true");
    expect(sql).toContain("AND is_demo = false");
    expect(sql).toContain('DROP POLICY IF EXISTS "catalog admin delete"');
    expect(sql).not.toContain('CREATE POLICY "catalog admin delete"');
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

  it("does not authorize an ordinary session or a marker-only URL", () => {
    expect(isRecoveryUrl("", "")).toBe(false);
    expect(isRecoveryUrl("#type=recovery", "")).toBe(false);
    expect(isRecoveryUrl("", "?type=recovery")).toBe(false);
  });

  it("requires a real implicit token pair or PKCE code and rejects errors", () => {
    expect(isRecoveryUrl("#type=recovery&access_token=token&refresh_token=refresh", "")).toBe(true);
    expect(isRecoveryUrl("", "?type=recovery&code=pkce-code")).toBe(true);
    const expired = parseRecoveryCallback(
      "#error=access_denied&error_code=otp_expired&error_description=expired",
      "",
    );
    expect(expired.authorized).toBe(false);
    expect(expired.error).toContain("expired");
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
  });
});
