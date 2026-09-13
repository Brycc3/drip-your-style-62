import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { scoreGap } from "../src/lib/shop-gap";
import { generateOutfits, type ClosetItem } from "../src/lib/outfit-generator";
import {
  parseBudget,
  readStylePreferences,
  stylePreferencesSchema,
} from "../src/lib/style-preferences";
import { requireQuerySuccess } from "../src/lib/query-errors";
import { validateClosetImage } from "../src/lib/closet-image-validation";
import { recordSeen, undoSeen } from "../src/lib/swipe-deck";
import type { VerifiableCatalogItem } from "../src/lib/shop-catalog";
import { parseCatalogImport } from "../src/lib/catalog-import";

const owned = (id: string, category: string, over: Partial<ClosetItem> = {}): ClosetItem => ({
  id,
  name: id,
  category,
  kind: category === "shoes" ? "shoes" : "clothing",
  color: "black",
  material: "cotton",
  fit: "regular",
  season: "all",
  formality: "casual",
  brand: "Owned brand",
  image_url: null,
  ...over,
});
const product = (over: Partial<VerifiableCatalogItem> = {}): VerifiableCatalogItem => ({
  id: "candidate",
  name: "Everyday tee",
  brand: "Example",
  category: "top",
  kind: "clothing",
  color: "cream",
  material: "cotton",
  fit: "regular",
  season: "all",
  formality: "casual",
  image_url: "/catalog/phase-2/midnight-rib-tee.svg",
  price: 60,
  current_price: 60,
  retailer: "Isolated test fixture, not inventory",
  buy_url: "https://example.com/fixture-only",
  image_rights_basis: "project_owned",
  source_type: "manual",
  source_name: "Isolated test",
  verification_method: "manual",
  verified_at: new Date().toISOString(),
  last_checked_at: new Date().toISOString(),
  availability: "in_stock",
  currency: "USD",
  is_demo: false,
  condition: "new",
  ...over,
});
const wardrobe = [
  owned("Black jeans", "bottom"),
  owned("White sneakers", "shoes", { color: "white" }),
];
const budget = { currency: "USD", amount: 100 };
const ask = {
  occasion: "errands" as const,
  vibe: "Minimal",
  temperatureF: 65,
  dressCode: "casual",
};

describe("launch wardrobe decisions", () => {
  it("rejects the illustrative inventory example rather than offering it for import", () => {
    const raw = readFileSync(
      new URL("../catalog/illustrative-example.DO-NOT-IMPORT.json", import.meta.url),
      "utf8",
    );
    const rows = parseCatalogImport(raw, "json");
    expect(rows).toHaveLength(1);
    expect(rows[0].errors.length).toBeGreaterThan(0);
    expect(rows[0].errors.join(" ")).toMatch(/price|image|url/i);
  });
  it("never encourages purchase of an unverified or stale candidate", () => {
    expect(scoreGap(product({ verified_at: null }), wardrobe, budget).guidance).toBe(
      "Check details",
    );
    expect(scoreGap(product({ last_checked_at: "2020-01-01" }), wardrobe, budget).guidance).toBe(
      "Check details",
    );
  });
  it("requires model/name evidence and names the likely duplicate", () => {
    const p = product();
    const same = owned(p.name, "top", { brand: p.brand, color: p.color });
    expect(scoreGap(p, [same, ...wardrobe], budget).duplicateNote).toContain(p.name);
    expect(scoreGap(p, [same, ...wardrobe], budget).guidance).toBe("Skip for now");
    expect(scoreGap(p, [{ ...same, name: "Different model" }, ...wardrobe], budget).duplicate).toBe(
      false,
    );
    expect(scoreGap(p, [{ ...same, fit: "oversized" }, ...wardrobe], budget).duplicate).toBe(false);
  });
  it("does not confuse different accessory subtypes", () => {
    const p = product({
      category: "accessory",
      accessory_subtype: "chains",
      name: "Silver everyday",
      color: "silver",
    });
    expect(
      scoreGap(p, [owned(p.name, "rings", { brand: p.brand, color: "silver" })]).duplicate,
    ).toBe(false);
  });
  it("requires all owned companion slots, never phantom shoes", () => {
    expect(scoreGap(product(), [wardrobe[0]]).outfitsUnlocked).toBe(0);
    expect(scoreGap(product(), wardrobe).outfitsUnlocked).toBe(1);
    expect(scoreGap(product(), [...wardrobe, wardrobe[1]]).outfitsUnlocked).toBe(1);
  });
  it("names only pieces from compatible complete outfits", () => {
    const g = scoreGap(product(), [
      ...wardrobe,
      owned("Tuxedo trousers", "bottom", { formality: "formal" }),
    ]);
    expect(g.matches.map((m) => m.name)).toEqual(["Black jeans", "White sneakers"]);
    expect(g.exampleOutfit.map((m) => m.id)).toEqual(wardrobe.map((m) => m.id));
  });
  it("rejects season-conflicting, overly busy, and unbalanced combinations", () => {
    expect(
      scoreGap(product({ season: "summer" }), [
        owned("Winter jeans", "bottom", { season: "winter" }),
        wardrobe[1],
      ]).outfitsUnlocked,
    ).toBe(0);
    expect(
      scoreGap(product({ color: "red" }), [
        owned("Green pants", "bottom", { color: "green" }),
        wardrobe[1],
      ]).outfitsUnlocked,
    ).toBe(0);
    expect(
      scoreGap(product({ fit: "oversized" }), [
        owned("Wide pants", "bottom", { fit: "oversized" }),
        wardrobe[1],
      ]).outfitsUnlocked,
    ).toBe(0);
  });
  it("counts outerwear only with a complete base outfit", () => {
    expect(scoreGap(product({ category: "outerwear" }), wardrobe).outfitsUnlocked).toBe(0);
    expect(
      scoreGap(product({ category: "outerwear" }), [owned("top", "top"), ...wardrobe])
        .outfitsUnlocked,
    ).toBe(1);
  });
  it("does not count fragrances as new outfits or match arbitrary tops", () => {
    const g = scoreGap(product({ category: "edp", kind: "fragrance" }), [
      owned("top", "top"),
      ...wardrobe,
    ]);
    expect(g.outfitsUnlocked).toBe(0);
    expect(g.matches).toEqual([]);
  });
  it("excludes archived items from duplicate and impact reasoning", () => {
    expect(
      scoreGap(
        product(),
        wardrobe.map((i) => ({ ...i, archived: true })),
      ).outfitsUnlocked,
    ).toBe(0);
  });
  it("uses the current price against the explicit per-item budget", () => {
    expect(scoreGap(product({ current_price: 120 }), wardrobe, budget).guidance).toBe(
      "Skip for now",
    );
    expect(scoreGap(product({ price: 120, current_price: 90 }), wardrobe, budget).guidance).toBe(
      "Consider buying",
    );
  });
  it("does not invent exchange rates, budgets or missing prices", () => {
    expect(scoreGap(product({ currency: "EUR" }), wardrobe, budget).guidance).toBe("Check details");
    expect(scoreGap(product(), wardrobe).guidance).toBe("Check details");
    expect(scoreGap(product({ price: null, current_price: null }), wardrobe, budget).guidance).toBe(
      "Check details",
    );
  });
  it("keeps demo guidance sample-only even with a plausible wardrobe", () => {
    expect(scoreGap(product({ is_demo: true }), wardrobe, budget).guidance).toBe("Sample only");
  });
  it("discloses tag and physical fit uncertainty", () => {
    expect(scoreGap(product({ fit: null }), wardrobe, budget).uncertainties.join(" ")).toContain(
      "missing",
    );
    expect(scoreGap(product(), wardrobe, budget).uncertainties.join(" ")).toContain("measurements");
  });
});

describe("reusable preferences and complete owned outfits", () => {
  it("advances exactly one unseen card and restores it on undo", () => {
    const deck = ["a", "b", "c"];
    const original = new Set<string>();
    const seen = recordSeen(original, "a");
    expect(deck.filter((s) => !seen.has(s))[0]).toBe("b");
    expect(original.size).toBe(0);
    const undone = undoSeen(seen, "a");
    expect(deck.filter((s) => !undone.has(s))[0]).toBe("a");
    expect(seen.has("a")).toBe(true);
  });
  it("round-trips sizes, custom vibes, colors and budget through the existing payload", () => {
    const p = {
      style_vibes: ["Soft tailoring"],
      favorite_colors: ["Cream"],
      sizes: { top: "M", bottom: "32", shoe: "EU 43" },
      budget_range: "EUR:125.50",
    };
    expect(readStylePreferences(stylePreferencesSchema.parse(p))).toEqual(p);
    expect(parseBudget(p.budget_range)).toEqual({ currency: "EUR", amount: 125.5 });
  });
  it("rejects negative, infinite, ambiguous and unsupported budgets", () => {
    for (const value of [
      "low",
      "100",
      "USD:-1",
      "USD:0",
      "USD:Infinity",
      "BTC:10",
      "USD:1e9",
      "USD:NaN",
    ]) {
      expect(parseBudget(value)).toBeNull();
    }
    expect(
      stylePreferencesSchema.safeParse({ ...readStylePreferences(), budget_range: "USD:-1" })
        .success,
    ).toBe(false);
  });
  it("does not invent sizes for a new user", () => {
    expect(readStylePreferences().sizes).toEqual({ top: "", bottom: "", shoe: "" });
  });
  it("does not generate without shoes or from archived pieces", () => {
    const run = (items: ClosetItem[]) =>
      generateOutfits(items, ask, new Set(), [], new Set(), new Set());
    expect(run([owned("t", "top"), wardrobe[0]])).toEqual([]);
    expect(run([owned("t", "top", { archived: true }), ...wardrobe])).toEqual([]);
    const outfits = run([owned("t", "top"), ...wardrobe]);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].shoes?.id).toBe(wardrobe[1].id);
  });
  it("uses saved favorite colors to break otherwise equal outfit scores", () => {
    const items = [
      owned("black top", "top"),
      owned("cream top", "top", { color: "cream" }),
      ...wardrobe,
    ];
    const outfits = generateOutfits(items, ask, new Set(), [], new Set(), new Set(), 5, 0, [
      "Cream",
    ]);
    expect(outfits[0].top.name).toBe("cream top");
    expect(outfits[0].rationale.join(" ")).toContain("favorite colors");
  });
  it("rejects a failed query rather than showing an empty wardrobe", () => {
    expect(() => requireQuerySuccess([{ data: null, error: { message: "offline" } }])).toThrow();
    const result = [{ data: [], error: null }];
    expect(requireQuerySuccess(result)).toBe(result);
  });
  it("validates photo MIME and size before any upload", () => {
    expect(validateClosetImage({ type: "image/jpeg", size: 128 })).toBeNull();
    for (const file of [
      { type: "image/svg+xml", size: 128 },
      { type: "image/heic", size: 128 },
      { type: "image/png", size: 0 },
      { type: "image/webp", size: 9 * 1024 * 1024 },
    ])
      expect(validateClosetImage(file)).not.toBeNull();
  });
});

type WorkerEvent = {
  waitUntil?: (p: Promise<unknown>) => void;
  request?: { url: string; method: string; mode: string };
  respondWith?: (p: Promise<Response>) => void;
};
function worker() {
  const handlers: Record<string, (e: WorkerEvent) => void> = {};
  const cached: string[] = [];
  const deleted: string[] = [];
  const cache = {
    addAll: async (paths: string[]) => {
      cached.push(...paths);
    },
  };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: {
      location: { origin: "https://drip.test" },
      clients: { claim: async () => {} },
      addEventListener: (kind: string, fn: (e: WorkerEvent) => void) => {
        handlers[kind] = fn;
      },
    },
    caches: {
      open: async () => cache,
      match: async (path: string) => new Response(`SHELL ${path}`),
      keys: async () => ["drip-public-shell-v0", "other-app-cache"],
      delete: async (key: string) => {
        deleted.push(key);
      },
    },
    fetch: async () => {
      throw new Error("offline");
    },
    URL,
    Response,
  });
  return { handlers, cached, deleted };
}
describe("offline worker privacy boundary (executed worker)", () => {
  it("installs only the static public shell and icon", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.install({
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(w.cached).toEqual(["/offline.html", "/icon-192.png"]);
  });
  it("serves a generic offline page without exposing a recovery URL", async () => {
    const w = worker();
    let response: Promise<Response> | undefined;
    w.handlers.fetch({
      request: {
        url: "https://drip.test/auth/reset-password?code=secret",
        method: "GET",
        mode: "navigate",
      },
      respondWith: (p: Promise<Response>) => {
        response = p;
      },
    });
    expect(await (await response!).text()).toBe("SHELL /offline.html");
    expect(w.cached).toEqual([]);
  });
  it("never intercepts mutations, APIs, private photos or cross-origin requests", () => {
    const w = worker();
    let touched = false;
    for (const request of [
      { url: "https://drip.test/api/save", method: "POST", mode: "cors" },
      { url: "https://drip.test/api/closet", method: "GET", mode: "cors" },
      {
        url: "https://backend.supabase.co/storage/v1/object/sign/closet/private",
        method: "GET",
        mode: "cors",
      },
    ])
      w.handlers.fetch({
        request,
        respondWith: () => {
          touched = true;
        },
      });
    expect(touched).toBe(false);
  });
  it("removes only obsolete DRIP shell caches", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.activate({
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(w.deleted).toEqual(["drip-public-shell-v0"]);
  });
});
