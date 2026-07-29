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

export type StarterTarget = {
  key: "tops" | "bottoms" | "shoes";
  label: string;
  have: number;
  need: number;
};

export type StarterProgress = {
  targets: StarterTarget[];
  filled: number;
  goal: number;
  percent: number;
  complete: boolean;
  missingCategories: StarterTarget[];
  generatorReady: boolean;
  missingCoreCategories: StarterTarget[];
};

export type ClosetStarterItem = {
  category?: string | null;
  kind?: string | null;
};

const TOP_CATEGORIES = new Set(["top", "tee", "hoodie", "shirt", "polo", "sweater", "tank"]);
const BOTTOM_CATEGORIES = new Set([
  "bottom",
  "trousers",
  "cargos",
  "joggers",
  "shorts",
  "denim",
  "pants",
  "skirt",
]);
const SHOE_CATEGORIES = new Set([
  "shoes",
  "sneaker",
  "jordan",
  "vomero",
  "new_balance",
  "loafer",
  "boot",
  "runner",
]);

export function starterCountsFromItems(items: ClosetStarterItem[]): StarterCounts {
  const counts: StarterCounts = { tops: 0, bottoms: 0, shoes: 0, accessories: 0 };
  for (const item of items) {
    const category = (item.category ?? "").toLowerCase();
    const kind = (item.kind ?? "").toLowerCase();
    if (kind === "shoes" || SHOE_CATEGORIES.has(category)) counts.shoes += 1;
    else if (kind === "accessory") counts.accessories += 1;
    else if (TOP_CATEGORIES.has(category)) counts.tops += 1;
    else if (BOTTOM_CATEGORIES.has(category)) counts.bottoms += 1;
  }
  return counts;
}

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
  const missingCoreCategories = targets.filter((t) => t.have < 1);
  return {
    targets,
    filled,
    goal,
    percent,
    complete: missingCategories.length === 0,
    missingCategories,
    generatorReady: missingCoreCategories.length === 0,
    missingCoreCategories,
  };
}
