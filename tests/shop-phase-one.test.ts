import { describe, expect, it } from "bun:test";
import {
  catalogFallbackFor,
  catalogImagePresentation,
  resolveCatalogImageSource,
} from "../src/lib/catalog-image";
import { dedupeCatalog, productActionFor } from "../src/lib/shop-catalog";
import {
  ACCESSORY_SUBTYPE_FILTERS,
  accessorySubcategory,
  type CatalogItem,
} from "../src/lib/shop-gap";

const catalogItem = (overrides: Partial<CatalogItem> = {}): CatalogItem => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: "Sample product",
  brand: "DRIP",
  category: "top",
  color: "black",
  price: 40,
  condition: "new",
  image_url: null,
  formality: "casual",
  season: "all",
  is_demo: true,
  ...overrides,
});

describe("catalog image safety", () => {
  it("falls back after an image load failure", () => {
    expect(catalogImagePresentation("/catalog/tee-heavyweight-black.jpg", false)).toBe("image");
    expect(catalogImagePresentation("/catalog/tee-heavyweight-black.jpg", true)).toBe("fallback");
  });

  it("never loads LoremFlickr or other unowned remote images for demo products", () => {
    expect(
      resolveCatalogImageSource({
        src: "https://loremflickr.com/640/640/sneaker",
        category: "sneaker",
        isDemo: true,
      }),
    ).toBe("/catalog/sneaker-runner-black.jpg");

    expect(
      resolveCatalogImageSource({
        src: "https://example.com/random-earring.jpg",
        category: "earrings",
        isDemo: true,
      }),
    ).toBeNull();
    expect(catalogFallbackFor("earrings").label).toBe("EARRINGS");
    expect(catalogFallbackFor("accessory Gold hoop earrings").label).toBe("EARRINGS");
  });
});

describe("visible catalog deduplication", () => {
  it("keeps the first product and removes normalized duplicates", () => {
    const result = dedupeCatalog([
      catalogItem({
        id: "newest",
        brand: "Acme",
        name: "Heavyweight Tee — Black",
        category: "tee",
        color: "Black",
      }),
      catalogItem({
        id: "duplicate",
        brand: " ACME ",
        name: "Heavyweight Tee Black",
        category: "tee",
        color: "black",
      }),
      catalogItem({
        id: "different-color",
        brand: "Acme",
        name: "Heavyweight Tee Black",
        category: "tee",
        color: "cream",
      }),
    ]);

    expect(result.map((item) => item.id)).toEqual(["newest", "different-color"]);
  });
});

describe("product button behavior", () => {
  const completeRetailMetadata = {
    retailer: "Verified Retailer",
    buy_url: "https://retailer.example/products/123",
    availability: "in_stock",
    last_checked_at: new Date().toISOString(),
  };

  // Pass 1 raises the bar: real provenance is required, not just a buy_url.
  const completeProvenance = {
    image_url: "https://cdn.retailer.example/products/123.jpg",
    image_rights_basis: "authorized",
    source_type: "manual",
    source_name: "Verified Retailer",
    verification_method: "manual",
    verified_at: new Date().toISOString(),
    current_price: 40,
  };

  it("uses View Sample for demos even when they contain a product-looking URL", () => {
    expect(productActionFor(catalogItem(completeRetailMetadata))).toEqual({
      kind: "sample",
      label: "View Sample",
      href: null,
    });
  });

  it("shows Needs verification when retailer provenance metadata is incomplete", () => {
    const action = productActionFor(
      catalogItem({
        ...completeRetailMetadata,
        is_demo: false,
        last_checked_at: null,
      }),
    );
    expect(action.kind).toBe("needs_verification");
    expect(action.href).toBeNull();
  });

  it("only enables Shop now for a fully verified non-demo product", () => {
    expect(
      productActionFor(
        catalogItem({
          ...completeRetailMetadata,
          ...completeProvenance,
          is_demo: false,
        }),
      ),
    ).toEqual({
      kind: "retailer",
      label: "Shop now",
      href: "https://retailer.example/products/123",
    });
  });
});

describe("accessory subtype coverage", () => {
  it("includes every Phase 1 accessory filter", () => {
    const labels = new Set(ACCESSORY_SUBTYPE_FILTERS.map((filter) => filter.label));
    for (const required of [
      "Earrings",
      "Prescription glasses",
      "Sunglasses",
      "Necklaces",
      "Chains",
      "Bracelets",
      "Rings",
      "Watches",
      "Hats",
      "Belts",
      "Bags",
      "Socks",
      "Scarves",
      "Wallets",
      "Grills",
    ]) {
      expect(labels.has(required)).toBe(true);
    }
  });

  it("classifies dedicated jewelry and eyewear subtypes independently", () => {
    expect(accessorySubcategory(catalogItem({ category: "earrings" }))).toBe("earrings");
    expect(
      accessorySubcategory(
        catalogItem({ category: "glasses", name: "Prescription optical frames" }),
      ),
    ).toBe("prescription_glasses");
    expect(accessorySubcategory(catalogItem({ category: "necklace" }))).toBe("necklaces");
    expect(accessorySubcategory(catalogItem({ category: "bracelet" }))).toBe("bracelets");
    expect(accessorySubcategory(catalogItem({ category: "grill" }))).toBe("grills");
  });
});
