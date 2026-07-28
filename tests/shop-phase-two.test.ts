import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  loadProducts,
  productImagePath,
  toDatabaseRow,
  validateManifest,
} from "../scripts/shop-catalog-lib.mjs";
import {
  catalogIdentityKey,
  catalogWindowSize,
  prioritizeUnseenCatalog,
} from "../src/lib/shop-catalog";
import type { CatalogItem, GapScore } from "../src/lib/shop-gap";

type DemoProduct = ReturnType<typeof loadProducts>[number];
type DemoRow = ReturnType<typeof toDatabaseRow>;

const projectRoot = path.resolve(import.meta.dir, "..");
const products = loadProducts() as DemoProduct[];
const rows = products.map(toDatabaseRow) as DemoRow[];

function generatedCatalogErrors(sourceProducts: DemoProduct[], sourceRows: DemoRow[]): string[] {
  const errors = [...validateManifest(sourceProducts)];
  const identities = new Set<string>();

  for (const row of sourceRows) {
    const identity = catalogIdentityKey(row as CatalogItem);
    if (identities.has(identity)) errors.push(`Duplicate generated identity: ${identity}`);
    identities.add(identity);

    if (!row.image_url) {
      errors.push(`Missing image: ${row.id}`);
    } else if (
      /loremflickr|picsum|source\.unsplash|images\.unsplash|^https?:\/\//i.test(row.image_url)
    ) {
      errors.push(`Unreliable or remote image: ${row.id}`);
    } else {
      const assetPath = path.join(projectRoot, "public", row.image_url);
      if (!fs.existsSync(assetPath)) errors.push(`Missing project asset: ${row.id}`);
    }

    if (
      !row.is_demo ||
      row.availability !== "sample_only" ||
      row.retailer !== null ||
      row.buy_url !== null ||
      row.last_checked_at !== null
    ) {
      errors.push(`Unsafe demo commerce metadata: ${row.id}`);
    }
  }

  return errors;
}

describe("Phase 2 curated demo catalog", () => {
  it("contains 40–60 balanced products across every requested family", () => {
    expect(products).toHaveLength(51);

    const groups = new Set(
      products.flatMap((product) => [
        product.kind,
        product.category,
        product.accessory_subtype,
        product.fragrance_family ? "fragrances" : null,
      ]),
    );
    for (const required of [
      "tee",
      "polo",
      "hoodie",
      "trousers",
      "cargos",
      "denim",
      "joggers",
      "bomber",
      "jacket",
      "coat",
      "shoes",
      "earrings",
      "prescription_glasses",
      "sunglasses",
      "necklaces",
      "chains",
      "bracelets",
      "rings",
      "watches",
      "hat",
      "beanie",
      "belts",
      "bags",
      "socks",
      "scarves",
      "wallets",
      "grills",
      "fragrances",
    ]) {
      expect(groups.has(required)).toBe(true);
    }
  });

  it("uses a unique, matching, project-owned SVG for every visible product", () => {
    const imagePaths = products.map(productImagePath);
    expect(new Set(imagePaths).size).toBe(products.length);

    const assetContents = products.map((product) => {
      const imagePath = productImagePath(product);
      expect(imagePath.startsWith("/catalog/phase-2/")).toBe(true);
      expect(imagePath).not.toMatch(
        /loremflickr|picsum|source\.unsplash|images\.unsplash|^https?:\/\//i,
      );

      const contents = fs.readFileSync(path.join(projectRoot, "public", imagePath), "utf8");
      expect(contents).toContain(`data-product="${product.slug}"`);
      expect(contents).toContain(`data-category="${product.category}"`);
      expect(contents).toContain(product.name);
      expect(contents.toLowerCase()).toContain(product.color.toLowerCase());

      const colorKeyword = product.color.toLowerCase().split(/\s+and\s+|\s+/)[0];
      expect(`${product.name} ${product.description}`.toLowerCase()).toContain(colorKeyword);
      return contents;
    });

    expect(new Set(assetContents).size).toBe(products.length);
  });

  it("materializes every item as DEMO and sample_only without commerce claims", () => {
    for (const row of rows) {
      expect(row.is_demo).toBe(true);
      expect(row.availability).toBe("sample_only");
      expect(row.retailer).toBeNull();
      expect(row.buy_url).toBeNull();
      expect(row.last_checked_at).toBeNull();
      expect(row.original_price).toBeNull();
    }
  });

  it("passes the catalog validation gate", () => {
    expect(generatedCatalogErrors(products, rows)).toEqual([]);
  });

  it("rejects duplicate identities and unsupported category mappings", () => {
    const duplicate = {
      ...products[0],
      slug: "duplicate-identity-fixture",
    };
    expect(validateManifest([...products, duplicate])).toEqual(
      expect.arrayContaining([expect.stringContaining("Duplicate identity")]),
    );

    const mismatched = products.map((product, index) =>
      index === 0 ? { ...product, category: "spacesuit" } : product,
    );
    expect(validateManifest(mismatched)).toEqual(
      expect.arrayContaining([expect.stringContaining("Unsupported kind/category pair")]),
    );
  });

  it("rejects missing images, unreliable hosts, and demo purchase links", () => {
    const missingImageRows = rows.map((row, index) =>
      index === 0 ? { ...row, image_url: "" } : row,
    );
    expect(generatedCatalogErrors(products, missingImageRows)).toEqual(
      expect.arrayContaining([expect.stringContaining("Missing image")]),
    );

    const remoteImageRows = rows.map((row, index) =>
      index === 0 ? { ...row, image_url: "https://loremflickr.com/800/800/shirt" } : row,
    );
    expect(generatedCatalogErrors(products, remoteImageRows)).toEqual(
      expect.arrayContaining([expect.stringContaining("Unreliable or remote image")]),
    );

    const purchaseLinkRows = rows.map((row, index) =>
      index === 0
        ? {
            ...row,
            retailer: "Invented Store",
            buy_url: "https://example.com/buy",
            availability: "in_stock",
          }
        : row,
    );
    expect(generatedCatalogErrors(products, purchaseLinkRows)).toEqual(
      expect.arrayContaining([expect.stringContaining("Unsafe demo commerce metadata")]),
    );
  });
});

describe("Phase 2 refresh rotation", () => {
  const scores = Array.from({ length: 12 }, (_, index) => ({
    item: { id: `product-${index}` },
    score: 1,
  })) as GapScore[];

  it("sizes the first window so a non-repeating next window is possible", () => {
    expect(catalogWindowSize(51)).toBe(12);
    expect(catalogWindowSize(5)).toBe(2);
    expect(catalogWindowSize(4)).toBe(2);
    expect(catalogWindowSize(1)).toBe(1);
  });

  it("moves the entire visible window behind unseen products on refresh", () => {
    const current = scores.slice(0, 6);
    const next = prioritizeUnseenCatalog(scores, new Set(current.map(({ item }) => item.id))).slice(
      0,
      6,
    );
    expect(next.map(({ item }) => item.id)).toEqual([
      "product-6",
      "product-7",
      "product-8",
      "product-9",
      "product-10",
      "product-11",
    ]);
  });
});
