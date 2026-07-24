import type { ClosetItem } from "./outfit-generator";

export type CatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  color: string | null;
  price: number | null;
  condition: "new" | "vintage" | "thrift" | "resale";
  image_url: string | null;
  formality: string;
  season: string;
};

export type GapScore = {
  item: CatalogItem;
  score: number; // 0..1
  reasons: string[];
  matches: ClosetItem[]; // owned items that pair
  outfitsUnlocked: number; // new (top,bottom,shoe) combos gained
  duplicate: boolean;
  duplicateNote?: string;
};

const TARGETS: Record<string, number> = {
  top: 5, bottom: 4, outerwear: 2, shoes: 3, accessory: 3,
};

function isPair(a: ClosetItem | CatalogItem, b: ClosetItem | CatalogItem): boolean {
  // Rough compatibility: shared formality tier and neutral or matching color.
  const fa = (a as { formality?: string }).formality ?? "casual";
  const fb = (b as { formality?: string }).formality ?? "casual";
  if (fa !== fb && Math.abs(fRank(fa) - fRank(fb)) > 1) return false;
  return true;
}
const F = { loungewear: 0, casual: 1, smart_casual: 2, business: 3, formal: 4 } as Record<string, number>;
function fRank(x: string) { return F[x] ?? 1; }

export function scoreGap(item: CatalogItem, closet: ClosetItem[]): GapScore {
  const owned = closet.filter((c) => c.category === item.category);
  const target = TARGETS[item.category] ?? 2;
  const shortfall = Math.max(0, target - owned.length) / target; // 0..1

  const duplicate = owned.some(
    (o) => (o.brand?.toLowerCase() ?? "") === (item.brand?.toLowerCase() ?? "") &&
           (o.color?.toLowerCase() ?? "") === (item.color?.toLowerCase() ?? "") &&
           !!item.brand && !!item.color,
  );

  // Count fresh outfits: for each of (top,bottom,shoe), if the item plugs into a missing slot, estimate combos gained.
  const tops = closet.filter((c) => c.category === "top");
  const bottoms = closet.filter((c) => c.category === "bottom");
  const shoes = closet.filter((c) => c.category === "shoes");
  let unlocked = 0;
  const matches: ClosetItem[] = [];

  if (item.category === "top") {
    for (const b of bottoms) if (isPair(item, b)) matches.push(b);
    unlocked = matches.length * Math.max(1, shoes.length);
  } else if (item.category === "bottom") {
    for (const t of tops) if (isPair(item, t)) matches.push(t);
    unlocked = matches.length * Math.max(1, shoes.length);
  } else if (item.category === "shoes") {
    for (const t of tops) for (const b of bottoms) if (isPair(item, t) && isPair(item, b)) unlocked++;
    matches.push(...tops.slice(0, 3));
  } else if (item.category === "outerwear") {
    for (const t of tops) if (isPair(item, t)) matches.push(t);
    unlocked = matches.length * Math.max(1, bottoms.length);
  } else {
    matches.push(...tops.slice(0, 2));
    unlocked = matches.length;
  }

  const reasons: string[] = [];
  if (shortfall > 0) reasons.push(`your ${item.category}s are thin (${owned.length}/${target})`);
  else reasons.push(`you already own ${owned.length} ${item.category}${owned.length === 1 ? "" : "s"}`);
  if (unlocked > 0) reasons.push(`~${unlocked} new outfit${unlocked === 1 ? "" : "s"} unlocked`);
  if (duplicate) reasons.push(`duplicate: same brand & color as one you own`);

  const score = Math.max(0, Math.min(1,
    shortfall * 0.5 +
    Math.min(1, unlocked / 8) * 0.4 -
    (duplicate ? 0.4 : 0) +
    0.1,
  ));

  return {
    item, score, reasons, matches: matches.slice(0, 4), outfitsUnlocked: unlocked, duplicate,
    duplicateNote: duplicate ? `You own a ${item.color} ${item.brand} ${item.category} already` : undefined,
  };
}

export function scoreCatalog(catalog: CatalogItem[], closet: ClosetItem[]): GapScore[] {
  return catalog.map((c) => scoreGap(c, closet)).sort((a, b) => b.score - a.score);
}
