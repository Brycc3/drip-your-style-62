import { describe, it, expect } from "bun:test";
import { pairScent, type Fragrance, type ClosetItem, type OutfitPick } from "../src/lib/outfit-generator";

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

const pick = (top: ClosetItem): OutfitPick => ({
  top,
  bottom: T({ category: "bottom" }),
  outerwear: null,
  shoes: null,
  accessory: null,
  score: 1,
  breakdown: { color: 1, silhouette: 1, weather: 1, formality: 1, occasion: 1, preference: 1, diversity: 1 },
  rationale: [],
});

// --- URL map keying (mirrors getSignedUrlsByItem) --------------------------
function urlsByItem(items: { id: string; image_url: string | null }[], byPath: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const i of items) if (i.image_url && byPath[i.image_url]) out[i.id] = byPath[i.image_url];
  return out;
}

describe("signed url mapping", () => {
  it("keys by item id, not path", () => {
    const items = [
      { id: "a", image_url: "u1/x.jpg" },
      { id: "b", image_url: "u1/y.jpg" },
      { id: "c", image_url: null },
    ];
    const byPath = { "u1/x.jpg": "https://x", "u1/y.jpg": "https://y" };
    const m = urlsByItem(items, byPath);
    expect(m["a"]).toBe("https://x");
    expect(m["b"]).toBe("https://y");
    expect(m["c"]).toBeUndefined();
  });
});

// --- shop feedback shape ---------------------------------------------------
function feedbackRow(uid: string, catalogId: string, action: "save" | "dismiss") {
  const save = action === "save";
  return { user_id: uid, catalog_id: catalogId, liked: save, saved: save, dismissed: !save };
}

describe("shop feedback payload", () => {
  it("save flips saved+liked true and dismissed false", () => {
    expect(feedbackRow("u", "c", "save")).toEqual({ user_id: "u", catalog_id: "c", liked: true, saved: true, dismissed: false });
  });
  it("dismiss inverts flags", () => {
    expect(feedbackRow("u", "c", "dismiss")).toEqual({ user_id: "u", catalog_id: "c", liked: false, saved: false, dismissed: true });
  });
});

// --- YYYY-MM-DD for wear_history.worn_on -----------------------------------
function toWornOn(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("wear date formatter", () => {
  it("emits YYYY-MM-DD", () => {
    expect(toWornOn(new Date("2026-01-05T13:45:00Z"))).toBe("2026-01-05");
    expect(toWornOn(new Date("2026-12-31T00:00:00Z"))).toBe("2026-12-31");
  });
});

// --- Scent leather tie-breaker actually breaks ties ------------------------
describe("scent tie-breaker", () => {
  it("prefers leather family when top material is leather", () => {
    const scents: Fragrance[] = [
      { id: "wood", name: "Woody", brand: null, family: "woody", season: "all", projection: null, longevity: null, occasions: [] },
      { id: "leather", name: "Leathery", brand: null, family: "leather", season: "all", projection: null, longevity: null, occasions: [] },
    ];
    const p = pairScent(
      pick(T({ material: "leather" })),
      scents,
      { occasion: "date", vibe: "old-money", temperatureF: 60, dressCode: "casual" },
      "old-money",
    );
    expect(p?.scent.id).toBe("leather");
  });
});
