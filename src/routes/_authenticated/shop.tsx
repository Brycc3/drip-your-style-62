import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { scoreCatalog, hasValidBuyUrl, type CatalogItem, type GapScore } from "@/lib/shop-gap";
import type { ClosetItem } from "@/lib/outfit-generator";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import { toast } from "sonner";
import {
  Bookmark,
  X,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ShoppingBag,
} from "lucide-react";

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

const CACHE_KEY = "drip.shop.cache.v1";
const PAGE_SIZE = 12;
const INITIAL = 16;

function classifyKind(cat: string): string {
  const c = cat.toLowerCase();
  if (
    ["shoes", "sneaker", "jordan", "vomero", "new_balance", "loafer", "boot", "runner"].includes(c)
  )
    return "shoes";
  if (
    [
      "accessory","hat","cap","beanie","belt","watch","chain","bracelet","ring","bag",
      "sunglasses","tie","socks","grill",
    ].includes(c)
  )
    return "accessory";
  if (["fragrance", "scent", "perfume", "cologne"].includes(c)) return "fragrance";
  return "clothing";
}

function primary(cat: string): "top" | "bottom" | "outerwear" | "shoes" | "accessory" | "other" {
  const c = cat.toLowerCase();
  if (["top", "tee", "hoodie", "shirt", "polo"].includes(c)) return "top";
  if (["bottom", "trousers", "cargos", "joggers", "shorts", "denim", "pants"].includes(c))
    return "bottom";
  if (["outerwear", "bomber", "chore", "jacket", "coat"].includes(c)) return "outerwear";
  if (["shoes","sneaker","jordan","vomero","new_balance","loafer","boot","runner"].includes(c))
    return "shoes";
  if (
    ["accessory","hat","cap","beanie","belt","watch","chain","bracelet","ring","bag","sunglasses","tie","socks","grill"].includes(c)
  )
    return "accessory";
  return "other";
}

type Tab = "items" | "outfits";

function ShopPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<(typeof CONDITIONS)[number]>("all");
  const [kind, setKind] = useState<(typeof KINDS)[number]["v"]>("all");
  const [tab, setTab] = useState<Tab>("items");
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [recentlyShown, setRecentlyShown] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(INITIAL);
  const [closetUrls, setClosetUrls] = useState<Record<string, string>>({});

  // Hydrate from session cache for instant paint
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { catalog: CatalogItem[]; closet: ClosetItem[] };
        if (parsed.catalog?.length) {
          setCatalog(parsed.catalog);
          setCloset(parsed.closet ?? []);
          setLoading(false);
        }
      }
    } catch { /* ignore */ }
  }, []);

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
          .order("created_at", { ascending: false })
          .limit(200),
        u
          ? supabase
              .from("closet_items")
              .select("id,name,category,kind,color,material,fit,season,formality,brand,image_url")
              .eq("user_id", u)
              .eq("archived", false)
          : Promise.resolve({ data: [] as ClosetItem[] }),
        u
          ? supabase.from("shop_feedback").select("catalog_id, saved, dismissed").eq("user_id", u)
          : Promise.resolve({ data: [] as { catalog_id: string; saved: boolean; dismissed: boolean }[] }),
      ]);
      const nextCatalog = ((cat ?? []) as CatalogItem[]).map((c) => ({
        ...c,
        kind: classifyKind(c.category),
      }));
      const nextCloset = ((ci.data ?? []) as unknown[]).filter(
        (i) => (i as ClosetItem).kind !== "fragrance",
      ) as ClosetItem[];
      setCatalog(nextCatalog);
      setCloset(nextCloset);
      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ catalog: nextCatalog, closet: nextCloset }),
        );
      } catch { /* ignore */ }
      const dSet = new Set<string>(), sSet = new Set<string>();
      for (const r of (fb.data ?? []) as Array<{ catalog_id: string; saved: boolean; dismissed: boolean }>) {
        if (r.dismissed) dSet.add(r.catalog_id);
        if (r.saved) sSet.add(r.catalog_id);
      }
      setDismissed(dSet);
      setSaved(sSet);
      setLoading(false);
      // Signed URLs for owned items (used in "Shop the outfit" cards)
      const owned = nextCloset.filter((i) => i.image_url);
      if (owned.length) {
        const urls = await getSignedUrlsByItem(
          owned.map((i) => ({ id: i.id, image_url: i.image_url as string | null })),
        );
        setClosetUrls(urls);
      }
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

  const visibleScored = useMemo(() => scored.slice(0, visible), [scored, visible]);

  const closetSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of closet) {
      const p = primary(c.category);
      counts[p] = (counts[p] ?? 0) + 1;
    }
    const total = closet.length;
    if (total === 0) return "Add pieces to your closet so Shop can rank real gaps.";
    const targets: Array<["top" | "bottom" | "outerwear" | "shoes" | "accessory", number, string]> = [
      ["top", 5, "tops"],
      ["bottom", 4, "bottoms"],
      ["outerwear", 2, "outerwear"],
      ["shoes", 3, "shoes"],
      ["accessory", 3, "accessories"],
    ];
    const gaps = targets
      .filter(([slot, tgt]) => (counts[slot] ?? 0) < tgt)
      .map(([, , label]) => label);
    const owned = `You own ${counts.top ?? 0} tops, ${counts.bottom ?? 0} bottoms, ${counts.shoes ?? 0} shoes.`;
    return gaps.length
      ? `${owned} Best next additions: ${gaps.slice(0, 3).join(", ")}.`
      : `${owned} Your core rotation is solid — refine with an accent piece.`;
  }, [closet]);

  const outfitIdeas = useMemo(() => {
    if (tab !== "outfits") return [];
    // Pick top scored items that have at least one matching owned piece and produce a small idea.
    return scored
      .filter((g) => g.matches.length > 0)
      .slice(0, 12)
      .map((g) => ({ pick: g, owned: g.matches.slice(0, 4) }));
  }, [tab, scored]);

  function refresh() {
    const topIds = scored.slice(0, 6).map((g) => g.item.id);
    setRecentlyShown((s) => {
      const next = new Set(s);
      topIds.forEach((id) => next.add(id));
      return new Set(Array.from(next).slice(-20));
    });
    setRefreshSeed((n) => n + 1);
    setVisible(INITIAL);
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
        <p className="mt-2 text-sm text-muted-foreground">Based on your closet · {closetSummary}</p>
        {anyDemo && (
          <p className="mt-2 rounded-md border border-border/70 bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
            Demo catalog — live retailer feeds arrive with the marketplace integration.
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("items")}
          className={`inline-flex items-center gap-1 rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest ${
            tab === "items"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground/80"
          }`}
        >
          <ShoppingBag className="h-3.5 w-3.5" /> Items
        </button>
        <button
          onClick={() => setTab("outfits")}
          className={`inline-flex items-center gap-1 rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest ${
            tab === "outfits"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground/80"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Shop the outfit
        </button>
      </div>

      {/* Filters toolbar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="-mx-5 flex flex-1 gap-2 overflow-x-auto px-5 scrollbar-hide">
            {KINDS.map((k) => (
              <button
                key={k.v}
                onClick={() => {
                  setKind(k.v);
                  setVisible(INITIAL);
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${
                  kind === k.v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-foreground/80"
                }`}
              >
                {k.l}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-surface-2"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 scrollbar-hide">
          {CONDITIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSource(s);
                setVisible(INITIAL);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${
                source === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground/80"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : tab === "items" ? (
        scored.length === 0 ? (
          <div className="card-surface p-6 text-center text-sm text-muted-foreground">
            No matches in this filter.
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleScored.map((g) => (
                <ItemCard
                  key={g.item.id}
                  g={g}
                  saved={saved.has(g.item.id)}
                  onSave={() => feedback(g.item.id, "save")}
                  onDismiss={() => feedback(g.item.id, "dismiss")}
                />
              ))}
            </ul>
            {visible < scored.length && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setVisible((n) => n + PAGE_SIZE)}
                  className="rounded-full border border-border px-5 py-2 text-xs uppercase tracking-widest hover:bg-surface-2"
                >
                  Load more ({scored.length - visible})
                </button>
              </div>
            )}
          </>
        )
      ) : outfitIdeas.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          Add a few pieces to your closet so we can build outfits around new items.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {outfitIdeas.map(({ pick, owned }) => (
            <OutfitCard
              key={pick.item.id}
              g={pick}
              owned={owned}
              closetUrls={closetUrls}
              saved={saved.has(pick.item.id)}
              onSave={() => feedback(pick.item.id, "save")}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemCard({
  g,
  saved,
  onSave,
  onDismiss,
}: {
  g: GapScore;
  saved: boolean;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const validBuy = hasValidBuyUrl(g.item);
  return (
    <li className="card-surface overflow-hidden flex flex-col">
      <div className="aspect-square bg-surface-2 relative">
        {g.item.image_url ? (
          <img
            src={g.item.image_url}
            alt={g.item.name}
            loading="lazy"
            width={480}
            height={480}
            className="h-full w-full object-cover"
          />
        ) : null}
        <span className="absolute top-2 right-2 rounded-full border border-primary/40 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
          Fit {(g.score * 100).toFixed(0)}
        </span>
        {g.item.is_demo && (
          <span className="absolute top-2 left-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Demo
          </span>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div>
          <p className="line-clamp-1 text-sm font-medium">{g.item.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {[g.item.brand, g.item.retailer, g.item.condition].filter(Boolean).join(" · ")}
          </p>
        </div>
        {(g.item.current_price ?? g.item.price) != null && (
          <p className="font-display text-lg text-primary">
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
          <p className="flex items-center gap-1 text-[11px] text-destructive">
            <AlertTriangle className="h-3 w-3" /> {g.duplicateNote}
          </p>
        )}
        <ul className="space-y-0.5">
          {g.reasons.map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground">· {r}</li>
          ))}
        </ul>
        {g.matches.length > 0 && (
          <p className="text-[11px] text-foreground/70">
            Pairs with:{" "}
            <span className="text-foreground/90">
              {g.matches.slice(0, 3).map((m) => m.name).join(", ")}
            </span>
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {validBuy && (
            <a
              href={g.item.buy_url!}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn-lime !px-3 !py-1.5 text-[10px] inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> Shop now
            </a>
          )}
          <button
            onClick={onSave}
            disabled={saved}
            className="flex-1 rounded-full border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-60 inline-flex items-center justify-center gap-1"
          >
            <Bookmark className="h-3 w-3" /> {saved ? "Saved" : "Save"}
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-full border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-surface-2 inline-flex items-center justify-center gap-1"
          >
            <X className="h-3 w-3" /> Pass
          </button>
        </div>
      </div>
    </li>
  );
}

function OutfitCard({
  g,
  owned,
  closetUrls,
  saved,
  onSave,
}: {
  g: GapScore;
  owned: ClosetItem[];
  closetUrls: Record<string, string>;
  saved: boolean;
  onSave: () => void;
}) {
  const validBuy = hasValidBuyUrl(g.item);
  return (
    <li className="card-surface overflow-hidden">
      <div className="p-3">
        <p className="text-[10px] uppercase tracking-widest text-primary">Shop the outfit</p>
        <p className="mt-1 text-sm text-foreground/80">
          Adds ~{g.outfitsUnlocked} new combinations with pieces you own.
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1 px-3">
        <div className="col-span-2 aspect-square bg-surface-2 relative rounded-md overflow-hidden">
          {g.item.image_url ? (
            <img
              src={g.item.image_url}
              alt={g.item.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : null}
          <span className="absolute bottom-1 left-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary-foreground">
            New
          </span>
        </div>
        <div className="col-span-3 grid grid-cols-2 gap-1">
          {owned.map((o) => (
            <div key={o.id} className="aspect-square bg-surface-2 relative rounded-md overflow-hidden">
              {closetUrls[o.id] ? (
                <img
                  src={closetUrls[o.id]}
                  alt={o.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[9px] uppercase tracking-widest text-muted-foreground p-1 text-center">
                  {o.name}
                </div>
              )}
              <span className="absolute bottom-1 left-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-foreground/80">
                Owned
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div>
          <p className="line-clamp-1 text-sm font-medium">{g.item.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {[g.item.brand, g.item.retailer, g.item.condition].filter(Boolean).join(" · ")}
          </p>
        </div>
        {(g.item.current_price ?? g.item.price) != null && (
          <p className="font-display text-lg text-primary">
            ${g.item.current_price ?? g.item.price}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {validBuy && (
            <a
              href={g.item.buy_url!}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn-lime !px-3 !py-1.5 text-[10px] inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> Shop the new piece
            </a>
          )}
          <button
            onClick={onSave}
            disabled={saved}
            className="flex-1 rounded-full border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-surface-2 disabled:opacity-60 inline-flex items-center justify-center gap-1"
          >
            <Bookmark className="h-3 w-3" /> {saved ? "Saved idea" : "Save idea"}
          </button>
        </div>
      </div>
    </li>
  );
}
