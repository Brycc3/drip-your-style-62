import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/shop")({
  head: () => ({
    meta: [
      { title: "Shop — DRIP" },
      { name: "description", content: "New, vintage, thrift, resale — recommendations that fill real gaps." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShopPage,
});

type Catalog = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  color: string | null;
  price: number | null;
  condition: "new" | "vintage" | "thrift" | "resale";
  image_url: string | null;
};

const CONDITIONS = ["all", "new", "vintage", "thrift", "resale"] as const;

function ShopPage() {
  const [items, setItems] = useState<Catalog[]>([]);
  const [source, setSource] = useState<(typeof CONDITIONS)[number]>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("shop_catalog")
        .select("id,name,brand,category,color,price,condition,image_url")
        .order("created_at", { ascending: false });
      setItems((data ?? []) as Catalog[]);
      setLoading(false);
    })();
  }, []);

  const filtered = source === "all" ? items : items.filter((i) => i.condition === source);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Shop</p>
        <h1 className="mt-1 font-display text-4xl">Fill your gaps</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Browsing a curated seed. In Phase 3, DRIP will score each piece by what your closet is missing and warn about duplicates.
        </p>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {CONDITIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${
              source === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {filtered.map((i) => (
            <li key={i.id} className="card-surface overflow-hidden">
              <div className="aspect-[3/4] bg-surface-2">
                {i.image_url ? (
                  <img src={i.image_url} alt={i.name} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-medium">{i.name}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {[i.brand, i.condition].filter(Boolean).join(" · ")}
                </p>
                {i.price != null && (
                  <p className="mt-1 font-display text-lg text-primary">${i.price}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
