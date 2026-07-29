import { describe, expect, it } from "bun:test";
import {
  isVerifiedPurchasable,
  productActionFor,
  type VerifiableCatalogItem,
} from "../src/lib/shop-catalog";

// Pin NOW to real Date.now() so productActionFor (which does not accept an
// override) sees a fresh verified_at/last_checked_at against the wall clock.
const NOW = Date.now();

function verifiedFixture(overrides: Partial<VerifiableCatalogItem> = {}): VerifiableCatalogItem {
  return {
    id: "cat-1",
    name: "Field Overshirt",
    brand: "Northline",
    category: "outerwear",
    color: "olive",
    price: 148,
    current_price: 148,
    condition: "new",
    image_url: "https://cdn.northline.example/products/field-overshirt.jpg",
    formality: "casual",
    season: "all",
    retailer: "Northline",
    buy_url: "https://northline.example/products/field-overshirt",
    availability: "in_stock",
    last_checked_at: new Date(NOW - 1000 * 60 * 60).toISOString(),
    is_demo: false,
    source_type: "manual",
    source_name: "Northline direct",
    source_url: "https://northline.example",
    image_rights_basis: "authorized",
    verified_at: new Date(NOW - 1000 * 60 * 60 * 24).toISOString(),
    verification_method: "manual",
    affiliate: false,
    ...overrides,
  } as VerifiableCatalogItem;
}

describe("isVerifiedPurchasable", () => {
  it("passes a complete verified fixture", () => {
    expect(isVerifiedPurchasable(verifiedFixture(), NOW)).toBe(true);
  });

  it("refuses demo rows even if every other field is set", () => {
    expect(isVerifiedPurchasable(verifiedFixture({ is_demo: true }), NOW)).toBe(false);
  });

  const requiredFields: Array<{ key: keyof VerifiableCatalogItem; bad: unknown }> = [
    { key: "name", bad: "" },
    { key: "brand", bad: null },
    { key: "retailer", bad: null },
    { key: "buy_url", bad: null },
    { key: "image_url", bad: null },
    { key: "image_rights_basis", bad: null },
    { key: "source_type", bad: null },
    { key: "source_name", bad: null },
    { key: "verification_method", bad: null },
    { key: "verified_at", bad: null },
    { key: "availability", bad: null },
    { key: "last_checked_at", bad: null },
    { key: "current_price", bad: null },
  ];

  for (const { key, bad } of requiredFields) {
    it(`fails when required field ${String(key)} is missing`, () => {
      const item = verifiedFixture({ [key]: bad } as Partial<VerifiableCatalogItem>);
      if (key === "current_price") (item as VerifiableCatalogItem).price = null;
      expect(isVerifiedPurchasable(item, NOW)).toBe(false);
    });
  }

  it("rejects http:// buy urls", () => {
    expect(
      isVerifiedPurchasable(
        verifiedFixture({ buy_url: "http://northline.example/x" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects unlisted image_rights_basis values", () => {
    expect(
      isVerifiedPurchasable(verifiedFixture({ image_rights_basis: "unknown" }), NOW),
    ).toBe(false);
  });

  it("rejects unlisted source_type values", () => {
    expect(isVerifiedPurchasable(verifiedFixture({ source_type: "guess" }), NOW)).toBe(false);
  });

  it("rejects out_of_stock availability", () => {
    expect(isVerifiedPurchasable(verifiedFixture({ availability: "out_of_stock" }), NOW)).toBe(
      false,
    );
  });

  it("rejects a zero or negative price", () => {
    expect(
      isVerifiedPurchasable(verifiedFixture({ current_price: 0, price: 0 }), NOW),
    ).toBe(false);
  });

  it("rejects stale verified_at older than 30 days", () => {
    const stale = new Date(NOW - 1000 * 60 * 60 * 24 * 45).toISOString();
    expect(isVerifiedPurchasable(verifiedFixture({ verified_at: stale }), NOW)).toBe(false);
  });

  it("rejects stale last_checked_at older than 30 days", () => {
    const stale = new Date(NOW - 1000 * 60 * 60 * 24 * 45).toISOString();
    expect(isVerifiedPurchasable(verifiedFixture({ last_checked_at: stale }), NOW)).toBe(false);
  });
});

describe("productActionFor", () => {
  it("returns Shop now for a fully verified item", () => {
    const action = productActionFor(verifiedFixture());
    expect(action.kind).toBe("retailer");
    if (action.kind === "retailer") {
      expect(action.href).toContain("https://");
    }
  });

  it("returns View Sample for demo items even with a buy_url", () => {
    const action = productActionFor(
      verifiedFixture({ is_demo: true, buy_url: "https://example.com/x" }),
    );
    expect(action.kind).toBe("sample");
    expect(action.label).toBe("View Sample");
  });

  it("returns Unavailable when explicitly out of stock", () => {
    const action = productActionFor(
      verifiedFixture({ is_demo: false, availability: "out_of_stock" }),
    );
    expect(action.kind).toBe("unavailable");
  });

  it("returns Needs verification for a non-demo row missing provenance", () => {
    const action = productActionFor(
      verifiedFixture({ is_demo: false, source_type: null, verified_at: null }),
    );
    expect(action.kind).toBe("needs_verification");
  });

  it("never returns View Sample for a non-demo unverified row", () => {
    const action = productActionFor(
      verifiedFixture({ is_demo: false, verified_at: null }),
    );
    expect(action.kind).not.toBe("sample");
  });
});
