// Rule-based, transparent outfit scorer. Not AI.
export type ClosetItem = {
  id: string;
  name: string;
  category: string; // top | bottom | outerwear | shoes | accessory
  kind: string;
  color: string | null;
  material: string | null;
  fit: string | null;
  season: string | null; // spring | summer | fall | winter | all
  formality: string | null;
  brand: string | null;
  image_url: string | null;
};

export type Fragrance = {
  id: string;
  name: string;
  brand: string | null;
  family: string | null;
  season: string;
  projection: string | null;
  longevity: string | null;
  occasions: string[];
};

const NEUTRALS = new Set([
  "black","white","cream","ivory","grey","gray","charcoal","beige","tan","stone","navy","brown","khaki","olive",
]);

const FORMALITY_RANK: Record<string, number> = {
  loungewear: 0, casual: 1, smart_casual: 2, business: 3, formal: 4,
};

const SEASON_TEMP: Record<string, [number, number]> = {
  winter: [10, 45],
  fall:   [40, 65],
  spring: [45, 70],
  summer: [65, 100],
  all:    [-20, 120],
};

// --- Occasion profiles ---------------------------------------------------
export type Occasion =
  | "work" | "date" | "church" | "brunch" | "gym" | "errands"
  | "party" | "travel" | "formal" | "outdoor";

export const OCCASIONS: { v: Occasion; l: string }[] = [
  { v: "work", l: "Work" },
  { v: "date", l: "Date" },
  { v: "church", l: "Church" },
  { v: "brunch", l: "Brunch" },
  { v: "gym", l: "Gym" },
  { v: "errands", l: "Errands" },
  { v: "party", l: "Party / Concert" },
  { v: "travel", l: "Travel" },
  { v: "formal", l: "Formal event" },
  { v: "outdoor", l: "Outdoor" },
];

type OccasionProfile = {
  formality: keyof typeof FORMALITY_RANK;
  keywords: string[]; // matched against name/brand/material/notes
  penalize: string[]; // materials/fits to avoid
  needsOuter?: boolean;
};

const OCCASION_PROFILES: Record<Occasion, OccasionProfile> = {
  work:    { formality: "smart_casual", keywords: ["oxford","chino","loafer","blazer","button","trouser"], penalize: ["graphic","cargo","athletic"] },
  date:    { formality: "smart_casual", keywords: ["leather","knit","suede","denim","tee"], penalize: ["athletic","fleece"] },
  church:  { formality: "business", keywords: ["dress","oxford","loafer","trouser","blazer"], penalize: ["graphic","athletic","cargo","short"] },
  brunch:  { formality: "casual", keywords: ["linen","knit","denim","loafer","tee"], penalize: ["athletic"] },
  gym:     { formality: "loungewear", keywords: ["athletic","training","fleece","jogger","tech","sneaker","nike","running","vomero","air"], penalize: ["leather","oxford","suede","denim"] },
  errands: { formality: "casual", keywords: ["tee","hoodie","denim","sneaker"], penalize: [] },
  party:   { formality: "casual", keywords: ["graphic","leather","denim","jordan","boot"], penalize: ["oxford"] },
  travel:  { formality: "casual", keywords: ["fleece","tech","cotton","sneaker","joggers","hoodie"], penalize: ["leather","suede"] },
  formal:  { formality: "formal", keywords: ["dress","oxford","suit","wool","trouser","blazer"], penalize: ["graphic","athletic","cargo","denim","sneaker","tee"] },
  outdoor: { formality: "casual", keywords: ["nylon","fleece","cargo","boot","tech","hike","trail"], penalize: ["suede","oxford"], needsOuter: true },
};

export type Ask = {
  occasion: Occasion;
  vibe: string;
  temperatureF: number;
  dressCode: keyof typeof FORMALITY_RANK;
};

export type ScoreBreakdown = {
  color: number;
  silhouette: number;
  weather: number;
  formality: number;
  occasion: number;
  preference: number;
  diversity: number;
};

export type OutfitPick = {
  top: ClosetItem;
  bottom: ClosetItem;
  outerwear: ClosetItem | null;
  shoes: ClosetItem | null;
  accessory: ClosetItem | null;
  score: number;
  breakdown: ScoreBreakdown;
  rationale: string[];
};

function normColor(c: string | null): string | null {
  if (!c) return null;
  return c.toLowerCase().trim().split(/\s+/)[0];
}

export function colorHarmonyScore(colors: (string | null)[]): { score: number; note: string } {
  const cs = colors.map(normColor).filter(Boolean) as string[];
  if (cs.length === 0) return { score: 0.5, note: "neutral palette" };
  const neutrals = cs.filter((c) => NEUTRALS.has(c));
  const nonN = cs.filter((c) => !NEUTRALS.has(c));
  if (nonN.length === 0) return { score: 1, note: `all-neutral palette (${cs.join(", ")})` };
  if (nonN.length === 1 && neutrals.length >= 1)
    return { score: 0.9, note: `one hero color (${nonN[0]}) grounded by neutrals` };
  if (new Set(nonN).size === 1)
    return { score: 0.75, note: `tonal look built around ${nonN[0]}` };
  return { score: 0.45, note: `multiple colors (${cs.join(", ")}) — busy` };
}

export function silhouetteScore(top: ClosetItem, bottom: ClosetItem): { score: number; note: string } {
  const t = (top.fit ?? "").toLowerCase();
  const b = (bottom.fit ?? "").toLowerCase();
  const loose = ["relaxed", "oversized", "boxy"];
  const tight = ["slim", "cropped"];
  const isLooseT = loose.some((k) => t.includes(k));
  const isTightT = tight.some((k) => t.includes(k));
  const isLooseB = loose.some((k) => b.includes(k));
  const isTightB = tight.some((k) => b.includes(k));
  if (isLooseT && isTightB) return { score: 1, note: "loose top over slim bottom — balanced silhouette" };
  if (isTightT && isLooseB) return { score: 1, note: "fitted top over relaxed bottom — balanced silhouette" };
  if (isLooseT && isLooseB) return { score: 0.55, note: "loose-on-loose — heavy" };
  if (isTightT && isTightB) return { score: 0.6, note: "slim-on-slim — severe" };
  return { score: 0.75, note: "clean regular silhouette" };
}

export function seasonScore(items: ClosetItem[], temperatureF: number): { score: number; note: string } {
  let hit = 0;
  for (const it of items) {
    const s = (it.season ?? "all").toLowerCase();
    const [lo, hi] = SEASON_TEMP[s] ?? SEASON_TEMP.all;
    if (temperatureF >= lo && temperatureF <= hi) hit++;
  }
  const ratio = hit / Math.max(1, items.length);
  return {
    score: ratio,
    note: ratio === 1 ? `everything works at ${temperatureF}°F` : `${hit}/${items.length} pieces match ${temperatureF}°F`,
  };
}

export function formalityScore(items: ClosetItem[], target: string): { score: number; note: string } {
  const t = FORMALITY_RANK[target] ?? 1;
  const diffs = items.map((i) => Math.abs((FORMALITY_RANK[i.formality ?? "casual"] ?? 1) - t));
  const avg = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
  const score = Math.max(0, 1 - avg / 2);
  return { score, note: avg === 0 ? `dialed to ${target}` : `${avg.toFixed(1)} step(s) off ${target}` };
}

export function occasionScore(items: ClosetItem[], occ: Occasion): { score: number; note: string } {
  const p = OCCASION_PROFILES[occ];
  const blob = items.map((i) => `${i.name} ${i.brand ?? ""} ${i.material ?? ""} ${i.fit ?? ""}`.toLowerCase()).join(" ");
  const kw = p.keywords.filter((k) => blob.includes(k)).length;
  const bad = p.penalize.filter((k) => blob.includes(k)).length;
  const raw = kw / Math.max(2, p.keywords.length) - bad * 0.15;
  const score = Math.max(0, Math.min(1, 0.5 + raw));
  const note = kw > 0
    ? `${kw} ${occ}-appropriate signal${kw === 1 ? "" : "s"}${bad ? `, ${bad} off-note` : ""}`
    : (bad ? `${bad} piece(s) fight the ${occ} vibe` : `neutral fit for ${occ}`);
  return { score, note };
}

export function preferenceScore(items: ClosetItem[], liked: Set<string>, disliked: Set<string>): { score: number; note: string } {
  let up = 0, down = 0;
  for (const it of items) {
    if (liked.has(it.id)) up++;
    if (disliked.has(it.id)) down++;
  }
  if (up === 0 && down === 0) return { score: 0.5, note: "no swipe history yet" };
  const score = Math.max(0, Math.min(1, 0.5 + up * 0.15 - down * 0.2));
  return { score, note: `${up} liked · ${down} passed in past swipes` };
}

export function generateOutfits(
  closet: ClosetItem[],
  ask: Ask,
  wornRecently: Set<string>,
  vibes: string[],
  liked: Set<string>,
  disliked: Set<string>,
  count = 5,
  rotation = 0,
): OutfitPick[] {
  const tops = closet.filter((i) => i.category === "top");
  const bottoms = closet.filter((i) => i.category === "bottom");
  const outers = closet.filter((i) => i.category === "outerwear");
  const shoes = closet.filter((i) => i.category === "shoes");
  const accs = closet.filter((i) => i.category === "accessory");
  const profile = OCCASION_PROFILES[ask.occasion];

  const results: OutfitPick[] = [];
  const needsOuter = ask.temperatureF < 60 || profile.needsOuter;

  for (const top of tops) {
    for (const bottom of bottoms) {
      const outerCandidates: (ClosetItem | null)[] = needsOuter && outers.length ? [...outers] : [null, ...outers.slice(0, 2)];
      for (const outer of outerCandidates) {
        const shoeC: (ClosetItem | null)[] = shoes.length ? [...shoes] : [null];
        for (const shoe of shoeC) {
          const accC: (ClosetItem | null)[] = accs.length ? [null, ...accs] : [null];
          for (const acc of accC) {
            const pieces = [top, bottom, outer, shoe, acc].filter(Boolean) as ClosetItem[];

            const color = colorHarmonyScore(pieces.map((p) => p.color));
            const silh = silhouetteScore(top, bottom);
            const season = seasonScore(pieces, ask.temperatureF);
            const formality = formalityScore(pieces, ask.dressCode);
            const occ = occasionScore(pieces, ask.occasion);
            const pref = preferenceScore(pieces, liked, disliked);

            const vibeBlob = pieces.map((p) => `${p.name} ${p.brand ?? ""}`.toLowerCase()).join(" ");
            const vibeBonus = vibes.some((v) => vibeBlob.includes(v.toLowerCase())) ? 0.05 : 0;

            const worn = pieces.filter((p) => wornRecently.has(p.id)).length;
            const diversity = Math.max(0, 1 - worn * 0.2);

            const score =
              color.score      * 0.20 +
              silh.score       * 0.15 +
              season.score     * 0.18 +
              formality.score  * 0.12 +
              occ.score        * 0.18 +
              pref.score       * 0.10 +
              diversity        * 0.07 +
              vibeBonus;

            results.push({
              top, bottom, outerwear: outer, shoes: shoe, accessory: acc,
              score,
              breakdown: {
                color: color.score, silhouette: silh.score, weather: season.score,
                formality: formality.score, occasion: occ.score, preference: pref.score, diversity,
              },
              rationale: [color.note, silh.note, season.note, formality.note, occ.note, pref.note],
            });
          }
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);

  // De-dupe by (top,bottom) pair — keep best per pair
  const seen = new Set<string>();
  const unique: OutfitPick[] = [];
  for (const r of results) {
    const key = `${r.top.id}|${r.bottom.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  // Rotation: cycle window through best combos so "Generate/More" gives fresh sets
  if (unique.length <= count) return unique;
  const start = (rotation * count) % unique.length;
  const rotated = [...unique.slice(start), ...unique.slice(0, start)];
  return rotated.slice(0, count);
}

// --- Scent pairing ---------------------------------------------------------
const VIBE_FAMILY: Record<string, string[]> = {
  streetwear: ["woody", "spicy", "amber"],
  minimal: ["fresh", "citrus", "aquatic", "clean"],
  techwear: ["synthetic", "aquatic", "woody"],
  sporty: ["fresh", "citrus", "aquatic"],
  "old-money": ["woody", "leather", "amber"],
  grunge: ["smoky", "woody", "leather"],
};

export function pairScent(
  outfit: OutfitPick,
  scents: Fragrance[],
  ask: Ask,
  vibe: string,
): { scent: Fragrance; reason: string } | null {
  if (!scents.length) return null;
  const seasonKey = ask.temperatureF < 45 ? "winter" : ask.temperatureF < 60 ? "fall" : ask.temperatureF < 75 ? "spring" : "summer";
  const preferredFamilies = VIBE_FAMILY[vibe.toLowerCase()] ?? [];
  const formal = FORMALITY_RANK[ask.dressCode] ?? 1;

  let best: { scent: Fragrance; s: number; reasons: string[] } | null = null;
  for (const f of scents) {
    let s = 0.5;
    const reasons: string[] = [];
    if (f.season === seasonKey || f.season === "all") { s += 0.2; reasons.push(`fits ${seasonKey}`); }
    if (f.family && preferredFamilies.some((p) => f.family!.toLowerCase().includes(p))) {
      s += 0.2; reasons.push(`${f.family} matches ${vibe.toLowerCase()}`);
    }
    if (f.occasions?.includes(ask.occasion)) { s += 0.15; reasons.push(`tagged for ${ask.occasion}`); }
    if (f.projection) {
      const strong = /strong|heavy|beast/i.test(f.projection);
      const soft = /light|soft|intimate/i.test(f.projection);
      if (formal >= 3 && strong) { s += 0.1; reasons.push("projection suits formal"); }
      if (formal <= 1 && soft) { s += 0.1; reasons.push("soft projection for casual"); }
    }
    // Tie-breaker: leather top pairs with leather/woody scents. Applied
    // BEFORE picking best so it actually influences the choice.
    if (outfit.top.material?.toLowerCase().includes("leather") && f.family?.toLowerCase().includes("leather")) {
      s += 0.05;
      reasons.push("leather echoes the leather top");
    }
    if (!best || s > best.s) best = { scent: f, s, reasons };
  }
  if (!best) return null;
  return { scent: best.scent, reason: best.reasons.join(" · ") || "closest match on shelf" };
}
