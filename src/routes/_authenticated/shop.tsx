import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scoreCatalog, type CatalogItem, type GapScore } from "@/lib/shop-gap";
import type { ClosetItem } from "@/lib/outfit-generator";
import { toast } from "sonner";
import { Bookmark, X, AlertTriangle } from "lucide-react";

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

const CONDITIONS = ["all", "new", "vintage", "thrift", "resale"] as const;

function ShopPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<(typeof CONDITIONS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      const [{ data: cat }, ci, fb] = await Promise.all([
        supabase.from("shop_catalog").select("id,name,brand,category,color,price,condition,image_url,formality,season").order("created_at", { ascending: false }),
        u ? supabase.from("closet_items").select("id,name,category,kind,color,material,fit,season,formality,brand,image_url").eq("user_id", u) : Promise.resolve({ data: [] }),
        u ? supabase.from("shop_feedback").select("catalog_id, saved, dismissed").eq("user_id", u) : Promise.resolve({ data: [] }),
      ]);
      setCatalog((cat ?? []) as CatalogItem[]);
      setCloset(((ci.data ?? []) as unknown[]).filter((i) => (i as ClosetItem).kind !== "fragrance") as ClosetItem[]);
      const dSet = new Set<string>(), sSet = new Set<string>();
      for (const r of (fb.data ?? []) as Array<{ catalog_id: string; saved: boolean; dismissed: boolean }>) {
        if (r.dismissed) dSet.add(r.catalog_id);
        if (r.saved) sSet.add(r.catalog_id);
      }
      setDismissed(dSet); setSaved(sSet);
      setLoading(false);
    })();
  }, []);

  const scored: GapScore[] = useMemo(() => {
    const filtered = catalog.filter((c) => (source === "all" || c.condition === source) && !dismissed.has(c.id));
    return scoreCatalog(filtered, closet);
  }, [catalog, closet, source, dismissed]);

  async function feedback(id: string, action: "save" | "dismiss") {
    if (!uid) return toast.error("Sign in to save");
    const saveFlag = action === "save";
    const dismissFlag = action === "dismiss";
    const { error } = await supabase
      .from("shop_feedback")
      .upsert(
        {
          user_id: uid,
          catalog_id: id,
          liked: saveFlag,
          saved: saveFlag,
          dismissed: dismissFlag,
        },
        { onConflict: "user_id,catalog_id" },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    if (dismissFlag) {
      setDismissed((s) => new Set(s).add(id));
      setSaved((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    } else {
      setSaved((s) => new Set(s).add(id));
      toast.success("Saved to wishlist");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Shop</p>
        <h1 className="mt-1 font-display text-4xl">Fill your gaps</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ranked by what your closet is missing. Duplicates get flagged.
        </p>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {CONDITIONS.map((s) => (
          <button key={s} onClick={() => setSource(s)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${source === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-surface" />)}
        </div>
      ) : scored.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">No matches in this filter.</div>
      ) : (
        <ul className="space-y-3">
          {scored.map((g) => (
            <li key={g.item.id} className="card-surface overflow-hidden">
              <div className="grid grid-cols-[7rem_1fr] gap-3">
                <div className="aspect-square bg-surface-2">
                  {g.item.image_url ? <img src={g.item.image_url} alt={g.item.name} loading="lazy" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="p-3 pl-0 pr-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{g.item.name}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {[g.item.brand, g.item.condition].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">Fit {(g.score * 100).toFixed(0)}</span>
                  </div>
                  {g.item.price != null && <p className="mt-1 font-display text-lg text-primary">${g.item.price}</p>}
                  {g.duplicate && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="h-3 w-3" /> {g.duplicateNote}</p>
                  )}
                  <ul className="mt-1 space-y-0.5">
                    {g.reasons.map((r, i) => <li key={i} className="text-xs text-muted-foreground">· {r}</li>)}
                  </ul>
                  {g.matches.length > 0 && (
                    <p className="mt-1 text-[11px] text-foreground/70">
                      Pairs with: <span className="text-foreground/90">{g.matches.slice(0, 3).map((m) => m.name).join(", ")}</span>
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => feedback(g.item.id, "save")} disabled={saved.has(g.item.id)}
                      className="flex-1 rounded-full border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-60 flex items-center justify-center gap-1">
                      <Bookmark className="h-3 w-3" /> {saved.has(g.item.id) ? "Saved" : "Save"}
                    </button>
                    <button onClick={() => feedback(g.item.id, "dismiss")}
                      className="flex-1 rounded-full border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1">
                      <X className="h-3 w-3" /> Not for me
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
