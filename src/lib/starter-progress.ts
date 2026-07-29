/**
 * Starter-closet progress logic. Kept in its own module so both the Home
 * page and unit tests share the same rules — progress is category-based
 * (3 tops / 2 bottoms / 2 shoes), never a total-item shortcut.
 */

export type StarterCounts = {
  tops: number;
  bottoms: number;
  shoes: number;
  accessories: number;
};

export type StarterTarget = { key: "tops" | "bottoms" | "shoes"; label: string; have: number; need: number };

export type StarterProgress = {
  targets: StarterTarget[];
  filled: number;
  goal: number;
  percent: number;
  complete: boolean;
  missingCategories: StarterTarget[];
};

export function computeStarterProgress(counts: StarterCounts): StarterProgress {
  const targets: StarterTarget[] = [
    { key: "tops", label: "Tops", have: counts.tops, need: 3 },
    { key: "bottoms", label: "Bottoms", have: counts.bottoms, need: 2 },
    { key: "shoes", label: "Shoes", have: counts.shoes, need: 2 },
  ];
  const filled = targets.reduce((a, t) => a + Math.min(t.have, t.need), 0);
  const goal = targets.reduce((a, t) => a + t.need, 0);
  const percent = goal === 0 ? 0 : Math.round((filled / goal) * 100);
  const missingCategories = targets.filter((t) => t.have < t.need);
  return {
    targets,
    filled,
    goal,
    percent,
    complete: missingCategories.length === 0,
    missingCategories,
  };
}
