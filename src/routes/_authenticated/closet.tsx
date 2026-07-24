import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/closet-storage";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/closet")({
  head: () => ({
    meta: [
      { title: "Closet — DRIP" },
      { name: "description", content: "Every piece you own." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClosetPage,
});

type Item = {
  id: string;
  name: string | null;
  category: string;
  primary_color: string | null;
  brand: string | null;
  image_path: string | null;
};

const CATEGORIES = ["all", "top", "bottom", "outerwear", "shoes", "accessory", "fragrance"] as const;

function ClosetPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("closet_items")
        .select("id,name,category,primary_color,brand,image_path")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      const list = (data ?? []) as Item[];
      setItems(list);
      setLoading(false);
      // sign urls
      const entries = await Promise.all(
        list
          .filter((i) => i.image_path)
          .map(async (i) => [i.id, (await getSignedUrl(i.image_path!)) ?? ""] as const),
      );
      setUrls(Object.fromEntries(entries));
    })();
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.category === filter)),
    [items, filter],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Wardrobe</p>
          <h1 className="mt-1 font-display text-4xl">Closet</h1>
        </div>
        <Link to="/closet/new" className="btn-lime inline-flex items-center gap-1 !px-4 !py-2 text-xs">
          <Plus className="h-4 w-4" /> Add
        </Link>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${
              filter === c ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? "No pieces yet." : "Nothing in this category."}
          </p>
          <Link to="/closet/new" className="btn-lime mt-4 inline-flex">
            Add a piece
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {filtered.map((i) => (
            <li key={i.id}>
              <Link
                to="/closet/$id"
                params={{ id: i.id }}
                className="card-surface block overflow-hidden"
              >
                <div className="aspect-[3/4] bg-surface-2">
                  {urls[i.id] ? (
                    <img src={urls[i.id]} alt={i.name ?? "Item"} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">
                      No photo
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-medium">{i.name || "Untitled"}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {[i.brand, i.primary_color, i.category].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
