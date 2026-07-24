import { describe, it, expect } from "bun:test";
import {
  generateOutfits,
  colorHarmonyScore,
  silhouetteScore,
  seasonScore,
  formalityScore,
  occasionScore,
  preferenceScore,
  pairScent,
  type ClosetItem,
  type Fragrance,
} from "../src/lib/outfit-generator";
import { scoreGap, type CatalogItem } from "../src/lib/shop-gap";

const T = (over: Partial<ClosetItem> = {}): ClosetItem => ({
  id: over.id ?? crypto.randomUUID(),
  name: "Item",
  category: "top",
  kind: "clothing",
  color: "black",
  material: "cotton",
  fit: "relaxed",
  season: "all",
  formality: "casual",
  brand: null,
  image_url: null,
  ...over,
});

describe("outfit-generator scorers", () => {
  it("rewards all-neutral palettes", () => {
    expect(colorHarmonyScore(["black", "white", "grey"]).score).toBe(1);
    expect(colorHarmonyScore(["red", "green", "blue"]).score).toBeLessThan(0.6);
  });
  it("balanced silhouette gets top score", () => {
    const t = T({ fit: "oversized" });
    const b = T({ category: "bottom", fit: "slim" });
    expect(silhouetteScore(t, b).score).toBe(1);
  });
  it("season score matches temperature", () => {
    const items = [T({ season: "summer" }), T({ season: "summer" })];
    expect(seasonScore(items, 80).score).toBe(1);
    expect(seasonScore(items, 20).score).toBe(0);
  });
  it("formality distance drops score", () => {
    expect(formalityScore([T({ formality: "casual" })], "casual").score).toBe(1);
    expect(formalityScore([T({ formality: "loungewear" })], "formal").score).toBe(0);
  });
  it("occasion signals surface", () => {
    const good = occasionScore(
      [T({ name: "Oxford shirt", brand: "brand", material: "chino" })],
      "work",
    );
    const bad = occasionScore([T({ name: "Graphic tee" })], "work");
    expect(good.score).toBeGreaterThan(bad.score);
  });
  it("preference nudges score", () => {
    const id = "abc";
    expect(preferenceScore([T({ id })], new Set([id]), new Set()).score).toBeGreaterThan(0.5);
    expect(preferenceScore([T({ id })], new Set(), new Set([id])).score).toBeLessThan(0.5);
  });
  it("rotation returns different sets", () => {
    const closet = [
      T({ id: "t1" }),
      T({ id: "t2" }),
      T({ id: "t3" }),
      T({ id: "b1", category: "bottom" }),
      T({ id: "b2", category: "bottom" }),
      T({ id: "b3", category: "bottom" }),
    ];
    const a = generateOutfits(
      closet,
      { occasion: "errands", vibe: "x", temperatureF: 65, dressCode: "casual" },
      new Set(),
      [],
      new Set(),
      new Set(),
      3,
      0,
    );
    const b = generateOutfits(
      closet,
      { occasion: "errands", vibe: "x", temperatureF: 65, dressCode: "casual" },
      new Set(),
      [],
      new Set(),
      new Set(),
      3,
      1,
    );
    expect(a.map((x) => x.top.id + x.bottom.id).join()).not.toBe(
      b.map((x) => x.top.id + x.bottom.id).join(),
    );
  });
});

describe("scent pairing", () => {
  it("picks a scent by season and family", () => {
    const scents: Fragrance[] = [
      {
        id: "1",
        name: "Cold Woody",
        brand: null,
        family: "woody",
        season: "winter",
        projection: "strong",
        longevity: "long",
        occasions: [],
      },
      {
        id: "2",
        name: "Summer Fresh",
        brand: null,
        family: "citrus",
        season: "summer",
        projection: "soft",
        longevity: "short",
        occasions: [],
      },
    ];
    const pick = pairScent(
      {
        top: T(),
        bottom: T({ category: "bottom" }),
        outerwear: null,
        shoes: null,
        accessory: null,
        score: 1,
        breakdown: {
          color: 1,
          silhouette: 1,
          weather: 1,
          formality: 1,
          occasion: 1,
          preference: 1,
          diversity: 1,
        },
        rationale: [],
      },
      scents,
      { occasion: "brunch", vibe: "Minimal", temperatureF: 80, dressCode: "casual" },
      "Minimal",
    );
    expect(pick?.scent.id).toBe("2");
  });
});

describe("shop gap scorer", () => {
  it("flags duplicates", () => {
    const owned: ClosetItem[] = [T({ brand: "Nike", color: "black", category: "shoes" })];
    const item: CatalogItem = {
      id: "x",
      name: "Nike shoe",
      brand: "Nike",
      category: "shoes",
      color: "black",
      price: 100,
      condition: "new",
      image_url: null,
      formality: "casual",
      season: "all",
    };
    const gap = scoreGap(item, owned);
    expect(gap.duplicate).toBe(true);
  });
  it("rewards filling thin categories", () => {
    const item: CatalogItem = {
      id: "y",
      name: "Chinos",
      brand: "X",
      category: "bottom",
      color: "khaki",
      price: 60,
      condition: "new",
      image_url: null,
      formality: "smart_casual",
      season: "all",
    };
    expect(scoreGap(item, []).score).toBeGreaterThan(0.3);
  });
});
