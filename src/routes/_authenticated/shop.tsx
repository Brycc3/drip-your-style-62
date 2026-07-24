import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scoreCatalog, hasValidBuyUrl, type CatalogItem, type GapScore } from "@/lib/shop-gap";
import type { ClosetItem } from "@/lib/outfit-generator";
import { toast } from "sonner";
import { Bookmark, X, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shop")({
  head: () => ({
    meta: [
      { title: "Shop — DRIP" },
      {
        name: "description",
        content: "New, vintage, thrift, resale — recommendations that fill real gaps.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShopPage,
});

const CONDITIONS = ["all", "new", "vintage", "thrift", "resale"] as const;
const KINDS = [
  { v: "all", l: "All" },
  { v: "clothing", l: "Clothing" },
  { v: "shoes", l: "Shoes" },
  { v: "accessory", l: "Accessories" },
  { v: "fragrance", l: "Fragrance" },
] as const;

function classifyKind(cat: string): string {
  const c = cat.toLowerCase();
  if (["shoes", "sneaker", "jordan", "vomero", "new_balance", "loafer", "boot", "runner"].includes(c))
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
  if (["fragrance", "scent", "perfume", "cologne"].includes(c)) return "fragrance";
  return "clothing";
}

function ShopPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<(typeof CONDITIONS)[number]>("all");
  const [kind, setKind] = useState<(typeof KINDS)[number]["v"]>("all");
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [recentlyShown, setRecentlyShown] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      const [{ data: cat }, ci, fb] = await Promise.all([
        supabase
          .from("shop_catalog")
          .select(
            "id,name,brand,category,color,price,current_price,original_price,condition,image_url,formality,season,retailer,buy_url,availability,is_demo",
          )
          .order("created_at", { ascending: false }),
        u
          ? supabase
              .from("closet_items")
              .select("id,name,category,kind,color,material,fit,season,formality,brand,image_url")
              .eq("user_id", u)
          : Promise.resolve({ data: [] }),
        u
          ? supabase.from("shop_feedback").select("catalog_id, saved, dismissed").eq("user_id", u)
          : Promise.resolve({ data: [] }),
      ]);
      setCatalog(((cat ?? []) as CatalogItem[]).map((c) => ({ ...c, kind: classifyKind(c.category) })));
      setCloset(
        ((ci.data ?? []) as unknown[]).filter(
          (i) => (i as ClosetItem).kind !== "fragrance",
        ) as ClosetItem[],
      );
      const dSet = new Set<string>(),
        sSet = new Set<string>();
      for (const r of (fb.data ?? []) as Array<{
        catalog_id: string;
        saved: boolean;
        dismissed: boolean;
      }>) {
        if (r.dismissed) dSet.add(r.catalog_id);
        if (r.saved) sSet.add(r.catalog_id);
      }
      setDismissed(dSet);
      setSaved(sSet);
      setLoading(false);
    })();
  }, []);

  const scored: GapScore[] = useMemo(() => {
    const filtered = catalog.filter(
      (c) =>
        (source === "all" || c.condition === source) &&
        (kind === "all" || c.kind === kind) &&
        (c.availability ? c.availability !== "out_of_stock" : true) &&
        !dismissed.has(c.id),
    );
    return scoreCatalog(filtered, closet, { recentlyShown, seed: refreshSeed });
  }, [catalog, closet, source, kind, dismissed, recentlyShown, refreshSeed]);

  function refresh() {
    // Remember top of previous page so next roll de-emphasizes them.
    const topIds = scored.slice(0, 6).map((g) => g.item.id);
    setRecentlyShown((s) => {
      const next = new Set(s);
      topIds.forEach((id) => next.add(id));
      // cap to last 20 to avoid starving the pool
      return new Set(Array.from(next).slice(-20));
    });
    setRefreshSeed((n) => n + 1);
  }

  async function feedback(id: string, action: "save" | "dismiss") {
    if (!uid) return toast.error("Sign in to save");
    const saveFlag = action === "save";
    const dismissFlag = action === "dismiss";
    const { error } = await supabase.from("shop_feedback").upsert(
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

  const anyDemo = scored.some((g) => g.item.is_demo);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Shop</p>
        <h1 className="mt-1 font-display text-4xl">Fill your gaps</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ranked by what your closet is missing. Duplicates get flagged.
        </p>
        {anyDemo && (
          <p className="mt-2 rounded-md border border-border/70 bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
            Demo catalog — live retailer feeds arrive with the marketplace integration.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
          {KINDS.map((k) => (
            <button
              key={k.v}
              onClick={() => setKind(k.v)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${kind === k.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}
            >
              {k.l}
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-surface-2 flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {CONDITIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${source === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : scored.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          No matches in this filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {scored.map((g) => {
            const validBuy = hasValidBuyUrl(g.item);
            return (
              <li key={g.item.id} className="card-surface overflow-hidden">
                <div className="grid grid-cols-[7rem_1fr] gap-3">
                  <div className="aspect-square bg-surface-2">
                    {g.item.image_url ? (
                      <img
                        src={g.item.image_url}
                        alt={g.item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="p-3 pl-0 pr-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-medium">{g.item.name}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                          {[g.item.brand, g.item.retailer, g.item.condition]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                        Fit {(g.score * 100).toFixed(0)}
                      </span>
                    </div>
                    {(g.item.current_price ?? g.item.price) != null && (
                      <p className="mt-1 font-display text-lg text-primary">
                        ${g.item.current_price ?? g.item.price}
                        {g.item.original_price &&
                          g.item.current_price &&
                          g.item.original_price > g.item.current_price && (
                            <span className="ml-2 text-xs text-muted-foreground line-through">
                              ${g.item.original_price}
                            </span>
                          )}
                      </p>
                    )}
                    {g.duplicate && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                        <AlertTriangle className="h-3 w-3" /> {g.duplicateNote}
                      </p>
                    )}
                    <ul className="mt-1 space-y-0.5">
                      {g.reasons.map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          · {r}
                        </li>
                      ))}
                    </ul>
                    {g.matches.length > 0 && (
                      <p className="mt-1 text-[11px] text-foreground/70">
                        Pairs with:{" "}
                        <span className="text-foreground/90">
                          {g.matches
                            .slice(0, 3)
                            .map((m) => m.name)
                            .join(", ")}
                        </span>
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {validBuy && (
                        <a
                          href={g.item.buy_url!}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="btn-lime !px-3 !py-1.5 text-[10px] flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Shop now
                        </a>
                      )}
                      <button
                        onClick={() => feedback(g.item.id, "save")}
                        disabled={saved.has(g.item.id)}
                        className="flex-1 rounded-full border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-60 flex items-center justify-center gap-1"
                      >
                        <Bookmark className="h-3 w-3" /> {saved.has(g.item.id) ? "Saved" : "Save"}
                      </button>
                      <button
                        onClick={() => feedback(g.item.id, "dismiss")}
                        className="flex-1 rounded-full border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1"
                      >
                        <X className="h-3 w-3" /> Not for me
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
