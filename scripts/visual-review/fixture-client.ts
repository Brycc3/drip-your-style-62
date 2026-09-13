// Deliberately fake in-memory client for visual inspection only. No network, tokens or real users.
/* eslint-disable @typescript-eslint/no-explicit-any -- This isolated query emulator deliberately accepts arbitrary table fixtures; it is not part of the app build. */
import manifest from "../../catalog/demo-products.json";
const scenario = new URLSearchParams(window.location.search).get("fixture");
const demos = manifest.map((p, index) => ({
  ...p,
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  archived: false,
  image_url: `/catalog/phase-2/${p.slug}.svg`,
  is_demo: true,
  availability: "sample_only",
  condition: "new",
  currency: "USD",
}));
const user = { id: "visual-fixture-owner", email: "fixture@example.invalid" };
const slot = (c: string) =>
  ["tee", "polo", "hoodie"].includes(c)
    ? "top"
    : ["trousers", "cargos", "denim", "joggers"].includes(c)
      ? "bottom"
      : ["sneaker", "runner", "loafer", "boot"].includes(c)
        ? "shoes"
        : c;
const closet = demos
  .filter((p) => ["tee", "trousers", "sneaker"].includes(p.category))
  .map((p) => ({
    ...p,
    category: slot(p.category),
    id: p.id.replace("20000000", "30000000"),
    archived: false,
    user_id: user.id,
  }));
const db: Record<string, any[]> = {
  shop_catalog: demos,
  closet_items: closet,
  profiles: [{ id: user.id, display_name: "Review wardrobe", onboarded: true, is_public: false }],
  user_preferences: [
    {
      user_id: user.id,
      style_vibes: ["Minimal"],
      favorite_colors: ["Black", "Cream"],
      sizes: { top: "M", bottom: "32", shoe: "10" },
      budget_range: "USD:100",
    },
  ],
};
if (scenario === "empty") db.closet_items = [];
if (scenario === "image-error") db.closet_items[0].image_url = "/missing-owned-photo.png";
export const supabase = {
  auth: { getUser: async () => ({ data: { user } }), signOut: async () => ({ error: null }) },
  storage: {
    from: () => ({
      createSignedUrl: async (path: string) => ({ data: { signedUrl: path }, error: null }),
    }),
  },
  from(table: string) {
    let rows = [...(db[table] ?? [])],
      single = false;
    const q: any = {
      select: (fields = "") => {
        if (table === "outfit_items" && fields.includes("closet_items(")) {
          rows = rows.map((row) => ({
            ...row,
            closet_items: closet.find((item) => item.id === row.closet_item_id) ?? null,
          }));
        }
        return q;
      },
      order: () => q,
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return q;
      },
      eq: (k: string, v: unknown) => {
        rows = rows.filter((r) => r[k] === v);
        return q;
      },
      in: (k: string, v: unknown[]) => {
        rows = rows.filter((r) => v.includes(r[k]));
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      single: () => {
        single = true;
        return q;
      },
      insert: (v: any) => {
        rows = (Array.isArray(v) ? v : [v]).map((r) => ({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          is_shopping_idea: false,
          ...r,
        }));
        db[table] = [...(db[table] ?? []), ...rows];
        return q;
      },
      upsert: (v: any) => {
        db[table] = [{ ...db[table]?.[0], ...v }];
        rows = db[table];
        return q;
      },
      update: (v: any) => {
        rows.forEach((r) => Object.assign(r, v));
        return q;
      },
      delete: () => {
        throw new Error("Deletion is disabled in fixture review");
      },
      then: (resolve: any) =>
        Promise.resolve({
          data: single ? (rows[0] ?? null) : rows,
          error: scenario === "error" ? { message: "Intentional isolated query failure" } : null,
          count: rows.length,
        }).then(resolve),
    };
    return q;
  },
};
