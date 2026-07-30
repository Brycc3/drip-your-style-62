import { describe, it, expect } from "bun:test";
import {
  scoreCatalog,
  hasValidBuyUrl,
  accessorySubcategory,
  fragranceFamily,
  type CatalogItem,
} from "../src/lib/shop-gap";
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
    expect(s1.join()).not.toBe(s2.join());
  });
});

describe("hasValidBuyUrl", () => {
  it("accepts https", () =>
    expect(
      hasValidBuyUrl(
        C({
          buy_url: "https://uniqlo.com/x",
          retailer: "Uniqlo",
          availability: "in_stock",
          last_checked_at: "2026-07-27T12:00:00Z",
          is_demo: false,
        }),
      ),
    ).toBe(true));
  it("accepts low stock and preorder", () => {
    for (const availability of ["low_stock", "preorder"]) {
      expect(
        hasValidBuyUrl(
          C({
            buy_url: "https://uniqlo.com/x",
            retailer: "Uniqlo",
            availability,
            last_checked_at: "2026-07-27T12:00:00Z",
            is_demo: false,
          }),
        ),
      ).toBe(true);
    }
  });
  it("rejects missing / malformed", () => {
    expect(hasValidBuyUrl(C({ buy_url: null }))).toBe(false);
    expect(
      hasValidBuyUrl(
        C({
          buy_url: "not-a-url",
          retailer: "Uniqlo",
          availability: "in_stock",
          last_checked_at: "2026-07-27T12:00:00Z",
          is_demo: false,
        }),
      ),
    ).toBe(false);
  });
});

function validateVibe(vibe: string, custom: string): string | null {
  if (vibe !== "Other") return null;
  if (!custom.trim()) return "Describe your vibe first";
  if (custom.trim().length > 60) return "Keep it under 60 characters";
  return null;
}
describe("custom vibe validation", () => {
  it("preset vibes require no custom text", () =>
    expect(validateVibe("Streetwear", "")).toBeNull());
  it("Other requires text", () => {
    expect(validateVibe("Other", "  ")).toBe("Describe your vibe first");
    expect(validateVibe("Other", "blokecore")).toBeNull();
  });
});

describe("accessorySubcategory", () => {
  it("classifies common accessory names", () => {
    expect(accessorySubcategory(C({ name: "Wool Beanie", category: "accessory" }))).toBe("beanie");
    expect(accessorySubcategory(C({ name: "Leather Belt", category: "belt" }))).toBe("belts");
    expect(accessorySubcategory(C({ name: "Crossbody Bag", category: "bag" }))).toBe("bags");
    expect(accessorySubcategory(C({ name: "G-Shock Watch", category: "watch" }))).toBe("watches");
    expect(accessorySubcategory(C({ name: "Silver Chain", category: "chain" }))).toBe("chains");
    expect(accessorySubcategory(C({ name: "Ray-Ban Sunglasses", category: "sunglasses" }))).toBe(
      "sunglasses",
    );
    expect(accessorySubcategory(C({ name: "Trucker Cap", category: "cap" }))).toBe("cap");
  });
});

describe("fragranceFamily", () => {
  it("classifies fragrance descriptors", () => {
    expect(fragranceFamily(C({ name: "Bergamot Cologne" }))).toBe("fresh");
    expect(fragranceFamily(C({ name: "Sandalwood Oud" }))).toBe("woody");
    expect(fragranceFamily(C({ name: "Vanilla Gourmand" }))).toBe("sweet");
    expect(fragranceFamily(C({ name: "Ocean Marine Splash" }))).toBe("aquatic");
    expect(fragranceFamily(C({ name: "Amber Tobacco" }))).toBe("warm");
  });
});

// recently-seen buffer behavior (pure logic — no localStorage)
function pushRing(prev: string[], add: string[], max = 40): string[] {
  const s = new Set(prev);
  for (const id of add) s.add(id);
  return Array.from(s).slice(-max);
}
describe("recently-seen ring buffer", () => {
  it("dedupes and caps at max size", () => {
    const r = pushRing(["a", "b"], ["b", "c", "d"]);
    expect(r).toEqual(["a", "b", "c", "d"]);
    const many = Array.from({ length: 60 }, (_, i) => `x${i}`);
    expect(pushRing([], many, 40).length).toBe(40);
  });
});

// Locked-slot preservation invariant used by Inspo Builder
type Sel = Record<string, { id: string } | undefined>;
function shuffleUnlocked(sel: Sel, locked: Set<string>, pool: Record<string, string[]>): Sel {
  const next: Sel = {};
  for (const k of Object.keys(sel)) if (locked.has(k) && sel[k]) next[k] = sel[k];
  for (const k of Object.keys(pool)) {
    if (next[k]) continue;
    const p = pool[k];
    if (p.length) next[k] = { id: p[0] };
  }
  return next;
}
describe("inspo locked slots", () => {
  it("preserves locked assignments through shuffle", () => {
    const sel: Sel = { top: { id: "t1" }, bottom: { id: "b1" } };
    const out = shuffleUnlocked(sel, new Set(["top"]), { top: ["t9"], bottom: ["b9"] });
    expect(out.top).toEqual({ id: "t1" });
    expect(out.bottom).toEqual({ id: "b9" });
  });
});

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
