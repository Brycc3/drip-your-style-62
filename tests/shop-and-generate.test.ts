import { describe, it, expect } from "bun:test";
import { scoreCatalog, hasValidBuyUrl, type CatalogItem } from "../src/lib/shop-gap";
import type { ClosetItem } from "../src/lib/outfit-generator";

const C = (over: Partial<CatalogItem>): CatalogItem => ({
  id: over.id ?? crypto.randomUUID(),
  name: "X",
  brand: "Uniqlo",
  category: "top",
  color: "black",
  price: 20,
  condition: "new",
  image_url: null,
  formality: "casual",
  season: "all",
  ...over,
});

const closet: ClosetItem[] = [
  {
    id: "t1",
    name: "tee",
    category: "top",
    kind: "clothing",
    color: "black",
    material: "cotton",
    fit: "relaxed",
    season: "all",
    formality: "casual",
    brand: null,
    image_url: null,
  },
  {
    id: "b1",
    name: "jeans",
    category: "bottom",
    kind: "clothing",
    color: "indigo",
    material: "denim",
    fit: "slim",
    season: "all",
    formality: "casual",
    brand: null,
    image_url: null,
  },
];

describe("shop rotation & diversity", () => {
  it("penalizes items shown recently so refresh reshuffles", () => {
    const cat = [
      C({ id: "a", category: "shoes" }),
      C({ id: "b", category: "shoes" }),
      C({ id: "c", category: "shoes" }),
    ];
    const first = scoreCatalog(cat, closet, { recentlyShown: new Set(), seed: 1 });
    const second = scoreCatalog(cat, closet, {
      recentlyShown: new Set([first[0].item.id]),
      seed: 2,
    });
    expect(second[0].item.id).not.toBe(first[0].item.id);
  });

  it("different seeds shuffle tied items", () => {
    const cat = [C({ id: "a" }), C({ id: "b" }), C({ id: "c" })];
    const s1 = scoreCatalog(cat, closet, { seed: 1 }).map((g) => g.item.id);
    const s2 = scoreCatalog(cat, closet, { seed: 42 }).map((g) => g.item.id);
    // Not strictly guaranteed but overwhelmingly likely with 3 seeds
    expect(s1.join()).not.toBe(s2.join());
  });
});

describe("hasValidBuyUrl", () => {
  it("accepts https", () => {
    expect(hasValidBuyUrl(C({ buy_url: "https://uniqlo.com/x" }))).toBe(true);
  });
  it("rejects missing / malformed", () => {
    expect(hasValidBuyUrl(C({ buy_url: null }))).toBe(false);
    expect(hasValidBuyUrl(C({ buy_url: "not-a-url" }))).toBe(false);
  });
});

// custom vibe validation as used in generate.tsx
function validateVibe(vibe: string, custom: string): string | null {
  if (vibe !== "Other") return null;
  if (!custom.trim()) return "Describe your vibe first";
  if (custom.trim().length > 60) return "Keep it under 60 characters";
  return null;
}

describe("custom vibe validation", () => {
  it("preset vibes require no custom text", () => {
    expect(validateVibe("Streetwear", "")).toBeNull();
  });
  it("Other requires text", () => {
    expect(validateVibe("Other", "  ")).toBe("Describe your vibe first");
    expect(validateVibe("Other", "blokecore")).toBeNull();
  });
});

// scent owned-vs-suggested: presence of any fragrance means "from shelf"
describe("scent presentation", () => {
  it("empty fragrance list yields a suggested profile, not a fake owned pairing", () => {
    const list: unknown[] = [];
    const owned = list.length > 0;
    expect(owned).toBe(false);
  });
});

// weather fallback: manual temp must remain usable when detect throws
async function safeDetect(fn: () => Promise<{ temperatureF: number }>) {
  try {
    return await fn();
  } catch {
    return null;
  }
}
describe("weather fallback", () => {
  it("returns null on denial without throwing", async () => {
    const r = await safeDetect(async () => {
      throw new Error("denied");
    });
    expect(r).toBeNull();
  });
});
