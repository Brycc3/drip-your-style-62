import type { ClosetItem } from "./outfit-generator";

export type CatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  color: string | null;
  price: number | null;
  current_price?: number | null;
  original_price?: number | null;
  condition: "new" | "vintage" | "thrift" | "resale";
  image_url: string | null;
  formality: string;
  season: string;
  retailer?: string | null;
  buy_url?: string | null;
  availability?: string | null;
  is_demo?: boolean;
  kind?: string; // clothing | shoes | accessory | fragrance
};

export type GapScore = {
  item: CatalogItem;
  score: number;
  reasons: string[];
  matches: ClosetItem[];
  outfitsUnlocked: number;
  duplicate: boolean;
  duplicateNote?: string;
};

const TARGETS: Record<string, number> = {
  top: 5,
  bottom: 4,
  outerwear: 2,
  shoes: 3,
  accessory: 3,
};

const F = { loungewear: 0, casual: 1, smart_casual: 2, business: 3, formal: 4 } as Record<
  string,
  number
>;
function fRank(x: string) {
  return F[x] ?? 1;
}
function isPair(a: ClosetItem | CatalogItem, b: ClosetItem | CatalogItem): boolean {
  const fa = (a as { formality?: string }).formality ?? "casual";
  const fb = (b as { formality?: string }).formality ?? "casual";
  if (fa !== fb && Math.abs(fRank(fa) - fRank(fb)) > 1) return false;
  return true;
}

// Coarse mapping from many subcategories to the 5 primary generator slots.
function primary(cat: string): "top" | "bottom" | "outerwear" | "shoes" | "accessory" | "other" {
  const c = cat.toLowerCase();
  if (["top", "tee", "hoodie", "shirt", "polo"].includes(c)) return "top";
  if (["bottom", "trousers", "cargos", "joggers", "shorts", "denim", "pants"].includes(c))
    return "bottom";
  if (["outerwear", "bomber", "chore", "jacket", "coat"].includes(c)) return "outerwear";
  if (
    ["shoes", "sneaker", "jordan", "vomero", "new_balance", "loafer", "boot", "runner"].includes(c)
  )
    return "shoes";
  if (
    [
      "accessory",
      "hat",
      "cap",
      "beanie",
      "belt",
      "watch",
      "chain",
      "bracelet",
      "ring",
      "bag",
      "sunglasses",
      "tie",
      "socks",
      "grill",
    ].includes(c)
  )
    return "accessory";
  return "other";
}

export function scoreGap(item: CatalogItem, closet: ClosetItem[]): GapScore {
  const slot = primary(item.category);
  const owned = closet.filter((c) => primary(c.category) === slot);
  const target = TARGETS[slot] ?? 2;
  const shortfall = Math.max(0, target - owned.length) / target;

  const duplicate = owned.some(
    (o) =>
      (o.brand?.toLowerCase() ?? "") === (item.brand?.toLowerCase() ?? "") &&
      (o.color?.toLowerCase() ?? "") === (item.color?.toLowerCase() ?? "") &&
      !!item.brand &&
      !!item.color,
  );

  const tops = closet.filter((c) => primary(c.category) === "top");
  const bottoms = closet.filter((c) => primary(c.category) === "bottom");
  const shoes = closet.filter((c) => primary(c.category) === "shoes");
  let unlocked = 0;
  const matches: ClosetItem[] = [];

  if (slot === "top") {
    for (const b of bottoms) if (isPair(item, b)) matches.push(b);
    unlocked = matches.length * Math.max(1, shoes.length);
  } else if (slot === "bottom") {
    for (const t of tops) if (isPair(item, t)) matches.push(t);
    unlocked = matches.length * Math.max(1, shoes.length);
  } else if (slot === "shoes") {
    for (const t of tops)
      for (const b of bottoms) if (isPair(item, t) && isPair(item, b)) unlocked++;
    matches.push(...tops.slice(0, 3));
  } else if (slot === "outerwear") {
    for (const t of tops) if (isPair(item, t)) matches.push(t);
    unlocked = matches.length * Math.max(1, bottoms.length);
  } else {
    matches.push(...tops.slice(0, 2));
    unlocked = matches.length;
  }

  const reasons: string[] = [];
  if (slot === "other") {
    reasons.push(`fragrance / lifestyle pick`);
  } else if (shortfall > 0) reasons.push(`your ${slot}s are thin (${owned.length}/${target})`);
  else reasons.push(`you already own ${owned.length} ${slot}${owned.length === 1 ? "" : "s"}`);
  if (unlocked > 0) reasons.push(`~${unlocked} new outfit${unlocked === 1 ? "" : "s"} unlocked`);
  if (duplicate) reasons.push(`duplicate: same brand & color as one you own`);

  const score = Math.max(
    0,
    Math.min(1, shortfall * 0.5 + Math.min(1, unlocked / 8) * 0.4 - (duplicate ? 0.4 : 0) + 0.1),
  );

  return {
    item,
    score,
    reasons,
    matches: matches.slice(0, 4),
    outfitsUnlocked: unlocked,
    duplicate,
    duplicateNote: duplicate
      ? `You own a ${item.color} ${item.brand} ${item.category} already`
      : undefined,
  };
}

export function scoreCatalog(
  catalog: CatalogItem[],
  closet: ClosetItem[],
  opts?: { recentlyShown?: Set<string>; seed?: number },
): GapScore[] {
  const recent = opts?.recentlyShown ?? new Set<string>();
  const seed = opts?.seed ?? 0;
  const scored = catalog.map((c) => {
    const g = scoreGap(c, closet);
    // Diversity penalty for anything shown in this session's last rotation.
    let s = g.score;
    if (recent.has(c.id)) s -= 0.25;
    // Deterministic jitter (per-item hash mixed with seed) so refresh reshuffles ties.
    const h = hashStr(c.id + ":" + seed) % 1000;
    s += (h / 1000) * 0.05;
    return { ...g, score: Math.max(0, Math.min(1, s)) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Accessory subcategory taxonomy — used by the Shop Accessories tab.
export type AccessorySub =
  | "hat" | "cap" | "beanie" | "belt" | "bag" | "watch"
  | "jewelry" | "sunglasses" | "socks" | "scarf" | "wallet" | "other";

export function accessorySubcategory(item: CatalogItem): AccessorySub {
  const blob = `${item.category} ${item.name} ${item.brand ?? ""}`.toLowerCase();
  if (/(beanie|toque)/.test(blob)) return "beanie";
  if (/\bcap\b/.test(blob)) return "cap";
  if (/(hat|bucket|fedora)/.test(blob)) return "hat";
  if (/belt/.test(blob)) return "belt";
  if (/(bag|tote|crossbody|backpack|sling|duffle|clutch)/.test(blob)) return "bag";
  if (/watch/.test(blob)) return "watch";
  if (/(chain|necklace|bracelet|ring|earring|jewel|pendant|grill)/.test(blob)) return "jewelry";
  if (/(sunglass|shades|eyewear)/.test(blob)) return "sunglasses";
  if (/sock/.test(blob)) return "socks";
  if (/scarf/.test(blob)) return "scarf";
  if (/wallet|cardholder/.test(blob)) return "wallet";
  return "other";
}

// Fragrance family classifier (fresh/woody/warm/sweet/aquatic/floral).
export type FragranceFamily =
  | "fresh" | "woody" | "warm" | "sweet" | "aquatic" | "floral" | "leather" | "other";

export function fragranceFamily(item: CatalogItem): FragranceFamily {
  const blob = `${item.name} ${item.brand ?? ""} ${item.color ?? ""}`.toLowerCase();
  if (/(aqua|marine|salt|ocean|sea)/.test(blob)) return "aquatic";
  if (/(citrus|bergamot|lemon|mint|green|fresh|cologne)/.test(blob)) return "fresh";
  if (/(oud|sandal|cedar|vetiver|wood)/.test(blob)) return "woody";
  if (/(amber|spice|tobacco|warm|cinnamon|clove)/.test(blob)) return "warm";
  if (/(vanilla|caramel|sweet|gourmand|choco|honey)/.test(blob)) return "sweet";
  if (/(rose|jasmine|floral|iris|violet|lily)/.test(blob)) return "floral";
  if (/leather|suede/.test(blob)) return "leather";
  return "other";
}

export function hasValidBuyUrl(item: CatalogItem): boolean {
  if (!item.buy_url) return false;
  try {
    const u = new URL(item.buy_url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
