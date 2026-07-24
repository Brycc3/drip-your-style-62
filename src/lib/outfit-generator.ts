// Rule-based outfit scorer. Transparent, not AI.
export type ClosetItem = {
  id: string;
  name: string;
  category: string; // top | bottom | outerwear | shoes | accessory | fragrance
  kind: string;
  color: string | null;
  material: string | null;
  fit: string | null;
  season: string | null; // spring | summer | fall | winter | all
  formality: string | null;
  brand: string | null;
  image_url: string | null;
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

export type Ask = {
  occasion: string;
  vibe: string;
  temperatureF: number;
  dressCode: keyof typeof FORMALITY_RANK;
};

export type OutfitPick = {
  top: ClosetItem;
  bottom: ClosetItem;
  outerwear: ClosetItem | null;
  shoes: ClosetItem | null;
  accessory: ClosetItem | null;
  score: number;
  rationale: string[];
};

function normColor(c: string | null): string | null {
  if (!c) return null;
  return c.toLowerCase().trim().split(/\s+/)[0];
}

function colorHarmonyScore(colors: (string | null)[]): { score: number; note: string } {
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

function silhouetteScore(top: ClosetItem, bottom: ClosetItem): { score: number; note: string } {
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
  if (isLooseT && isLooseB) return { score: 0.55, note: "loose-on-loose — intentional but heavy" };
  if (isTightT && isTightB) return { score: 0.6, note: "slim-on-slim — sharp but severe" };
  return { score: 0.75, note: "clean regular silhouette" };
}

function seasonScore(items: ClosetItem[], temperatureF: number): { score: number; note: string } {
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

function formalityScore(items: ClosetItem[], target: string): { score: number; note: string } {
  const t = FORMALITY_RANK[target] ?? 1;
  const diffs = items.map((i) => Math.abs((FORMALITY_RANK[i.formality ?? "casual"] ?? 1) - t));
  const avg = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
  const score = Math.max(0, 1 - avg / 2);
  return { score, note: avg === 0 ? `dialed to ${target}` : `${avg.toFixed(1)} step(s) off ${target}` };
}

export function generateOutfits(
  closet: ClosetItem[],
  ask: Ask,
  wornRecently: Set<string>,
  vibes: string[],
  count = 5,
): OutfitPick[] {
  const tops = closet.filter((i) => i.category === "top");
  const bottoms = closet.filter((i) => i.category === "bottom");
  const outers = closet.filter((i) => i.category === "outerwear");
  const shoes = closet.filter((i) => i.category === "shoes");
  const accs = closet.filter((i) => i.category === "accessory");

  const results: OutfitPick[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      // Try optional outerwear only when it's cold or the vibe calls for layering
      const outerCandidates: (ClosetItem | null)[] = ask.temperatureF < 60 && outers.length ? [...outers] : [null, ...outers.slice(0, 2)];
      for (const outer of outerCandidates) {
        const shoeC = shoes.length ? shoes : [null];
        for (const shoe of shoeC) {
          const acc = accs[0] ?? null;
          const pieces = [top, bottom, ...(outer ? [outer] : []), ...(shoe ? [shoe] : [])];

          const color = colorHarmonyScore(pieces.map((p) => p.color));
          const silhouette = silhouetteScore(top, bottom);
          const season = seasonScore(pieces, ask.temperatureF);
          const formality = formalityScore(pieces, ask.dressCode);

          // Vibe bonus if brand/notes echo vibe keyword
          const vibeText = [top, bottom, outer, shoe].filter(Boolean).map((p) => `${p!.name} ${p!.brand ?? ""}`.toLowerCase()).join(" ");
          const vibeBonus = vibes.some((v) => vibeText.includes(v.toLowerCase())) ? 0.05 : 0;

          // Diversity penalty for recent wears
          const worn = pieces.filter((p) => wornRecently.has(p.id)).length;
          const diversity = 1 - worn * 0.1;

          const score =
            color.score * 0.28 +
            silhouette.score * 0.22 +
            season.score * 0.25 +
            formality.score * 0.20 +
            diversity * 0.05 +
            vibeBonus;

          results.push({
            top,
            bottom,
            outerwear: outer,
            shoes: shoe,
            accessory: acc,
            score,
            rationale: [color.note, silhouette.note, season.note, formality.note],
          });
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  // De-dupe by (top,bottom) pair — keep highest scoring variant
  const seen = new Set<string>();
  const unique: OutfitPick[] = [];
  for (const r of results) {
    const key = `${r.top.id}|${r.bottom.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
    if (unique.length >= count) break;
  }
  return unique;
}
