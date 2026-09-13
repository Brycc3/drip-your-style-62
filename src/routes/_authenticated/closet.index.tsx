import { OwnedImage } from "@/components/OwnedImage";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/closet-storage";
import { Plus, FlaskConical, Archive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/closet/")({
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
  name: string;
  category: string;
  kind: string;
  color: string | null;
  brand: string | null;
  image_url: string | null;
  archived: boolean;
};

const FILTERS = [
  { v: "all", l: "All" },
  { v: "top", l: "Tops" },
  { v: "bottom", l: "Bottoms" },
  { v: "outerwear", l: "Outerwear" },
  { v: "shoes", l: "Shoes" },
  { v: "accessory", l: "Accessories" },
  { v: "fragrance", l: "Fragrances" },
  { v: "archived", l: "Archived" },
] as const;
type FilterKey = (typeof FILTERS)[number]["v"];

function ClosetPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Session expired");
      const { data, error } = await supabase
        .from("closet_items")
        .select("id,name,category,kind,color,brand,image_url,archived")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as Item[];
      setItems(list);
      setLoading(false);
      const entries = await Promise.all(
        list
          .filter((i) => i.image_url)
          .map(async (i) => [i.id, (await getSignedUrl(i.image_url!)) ?? ""] as const),
      );
      setUrls(Object.fromEntries(entries));
    })().catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (filter === "archived") return items.filter((i) => i.archived);
    const active = items.filter((i) => !i.archived);
    if (filter === "all") return active;
    if (filter === "fragrance") return active.filter((i) => i.kind === "fragrance");
    return active.filter((i) => i.category === filter && i.kind !== "fragrance");
  }, [items, filter]);

  if (loadError)
    return (
      <div role="alert" className="card-surface p-5">
        <p>Your closet could not load. Your pieces have not been removed.</p>
        <button className="btn-lime mt-3" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Wardrobe</p>
          <h1 className="mt-1 font-display text-4xl">Closet</h1>
        </div>
        {filter === "fragrance" ? (
          <Link
            to="/scents"
            className="btn-lime inline-flex items-center gap-1 !px-4 !py-2 text-xs"
          >
            <FlaskConical className="h-4 w-4" /> Add scent
          </Link>
        ) : filter === "archived" ? null : (
          <Link
            to="/closet/new"
            className="btn-lime inline-flex items-center gap-1 !px-4 !py-2 text-xs"
          >
            <Plus className="h-4 w-4" /> Add
          </Link>
        )}
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide">
        {FILTERS.map((c) => (
          <button
            key={c.v}
            onClick={() => setFilter(c.v)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest inline-flex items-center gap-1 ${
              filter === c.v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80"
            }`}
          >
            {c.v === "archived" && <Archive className="h-3 w-3" />}
            {c.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {filter === "archived"
              ? "No archived pieces."
              : filter === "fragrance"
                ? "No fragrances yet. Add one so DRIP can pair scents with outfits."
                : items.length === 0
                  ? "No pieces yet."
                  : "Nothing in this category."}
          </p>
          {filter === "fragrance" ? (
            <Link to="/scents" className="btn-lime mt-4 inline-flex">
              Manage fragrances
            </Link>
          ) : filter !== "archived" ? (
            <Link to="/closet/new" className="btn-lime mt-4 inline-flex">
              Add a piece
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((i) => {
            const isFrag = i.kind === "fragrance";
            return (
              <li key={i.id}>
                {isFrag ? (
                  <Link to="/scents" className="card-surface block overflow-hidden">
                    <FragBody item={i} url={urls[i.id]} />
                  </Link>
                ) : (
                  <Link
                    to="/closet/$id"
                    params={{ id: i.id }}
                    className={`card-surface block overflow-hidden ${
                      i.archived ? "opacity-60" : ""
                    }`}
                  >
                    <Body item={i} url={urls[i.id]} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Body({ item, url }: { item: Item; url?: string }) {
  return (
    <>
      <div className="aspect-[3/4] bg-surface-2">
        {url ? (
          <OwnedImage
            src={url}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          {[item.brand, item.color, item.category].filter(Boolean).join(" · ")}
        </p>
      </div>
    </>
  );
}
function FragBody({ item, url }: { item: Item; url?: string }) {
  return (
    <>
      <div className="aspect-[3/4] bg-surface-2 flex items-center justify-center">
        {url ? (
          <OwnedImage
            src={url}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <FlaskConical className="h-10 w-10 text-primary/70" />
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          {[item.brand, "Fragrance"].filter(Boolean).join(" · ")}
        </p>
      </div>
    </>
  );
}
