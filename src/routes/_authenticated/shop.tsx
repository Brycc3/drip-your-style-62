import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  scoreCatalog,
  hasValidBuyUrl,
  accessorySubcategory,
  fragranceFamily,
  type CatalogItem,
  type GapScore,
  type AccessorySub,
  type FragranceFamily,
} from "@/lib/shop-gap";
import type { ClosetItem } from "@/lib/outfit-generator";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import { getRecentlySeen, pushRecentlySeen } from "@/lib/recently-seen";
import { CatalogImage } from "@/components/CatalogImage";
import { toast } from "sonner";
import {
  Bookmark,
  X,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Layers,
  Eye,
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

type PrimaryTab = "clothing" | "shoes" | "accessories" | "fragrance" | "outfits";
const PRIMARY_TABS: { v: PrimaryTab; l: string }[] = [
  { v: "clothing", l: "Clothing" },
  { v: "shoes", l: "Shoes" },
  { v: "accessories", l: "Accessories" },
  { v: "fragrance", l: "Fragrance" },
  { v: "outfits", l: "Outfit Ideas" },
];

const CONDITIONS = ["all", "new", "vintage", "thrift", "resale"] as const;
const ACC_SUBS: { v: AccessorySub | "all"; l: string }[] = [
  { v: "all", l: "All" },
  { v: "hat", l: "Hats" },
  { v: "cap", l: "Caps" },
  { v: "beanie", l: "Beanies" },
  { v: "belt", l: "Belts" },
  { v: "bag", l: "Bags" },
  { v: "watch", l: "Watches" },
  { v: "jewelry", l: "Jewelry" },
  { v: "sunglasses", l: "Sunglasses" },
  { v: "socks", l: "Socks" },
  { v: "scarf", l: "Scarves" },
  { v: "wallet", l: "Wallets" },
];
const FRAG_FAMS: { v: FragranceFamily | "all"; l: string }[] = [
  { v: "all", l: "All" },
  { v: "fresh", l: "Fresh" },
  { v: "woody", l: "Woody" },
  { v: "warm", l: "Warm/Spicy" },
  { v: "sweet", l: "Sweet" },
  { v: "aquatic", l: "Aquatic" },
  { v: "floral", l: "Floral" },
  { v: "leather", l: "Leather" },
];

const CACHE_KEY = "drip.shop.cache.v2";
const PAGE_SIZE = 12;
const INITIAL = 16;

function primaryKind(cat: string): PrimaryTab | "other" {
  const c = cat.toLowerCase();
  if (
    ["shoes", "sneaker", "jordan", "vomero", "new_balance", "loafer", "boot", "runner"].includes(c)
  )
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
      "scarf",
      "wallet",
      "jewelry",
    ].includes(c)
  )
    return "accessories";
  if (
    ["fragrance", "scent", "perfume", "cologne"].includes(c) ||
    /fragrance|perfume|cologne|scent/.test(c)
  )
    return "fragrance";
  if (
    [
      "top",
      "tee",
      "hoodie",
      "shirt",
      "polo",
      "bottom",
      "trousers",
      "cargos",
      "joggers",
      "shorts",
      "denim",
      "pants",
      "outerwear",
      "bomber",
      "chore",
      "jacket",
      "coat",
    ].includes(c)
  )
    return "clothing";
  return "other";
}

function primarySlot(
  cat: string,
): "top" | "bottom" | "outerwear" | "shoes" | "accessory" | "other" {
  const c = cat.toLowerCase();
  if (["top", "tee", "hoodie", "shirt", "polo"].includes(c)) return "top";
  if (["bottom", "trousers", "cargos", "joggers", "shorts", "denim", "pants"].includes(c))
    return "bottom";
  if (["outerwear", "bomber", "chore", "jacket", "coat"].includes(c)) return "outerwear";
  if (
    ["shoes", "sneaker", "jordan", "vomero", "new_balance", "loafer", "boot", "runner"].includes(c)
  )
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
      "scarf",
      "wallet",
      "jewelry",
    ].includes(c)
  )
    return "accessory";
  return "other";
}

function ShopPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<(typeof CONDITIONS)[number]>("all");
  const [tab, setTab] = useState<PrimaryTab>("clothing");
  const [accSub, setAccSub] = useState<AccessorySub | "all">("all");
  const [fragFam, setFragFam] = useState<FragranceFamily | "all">("all");
  const [sort, setSort] = useState<"gap" | "new">("gap");
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [recentlyShown, setRecentlyShown] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(INITIAL);
  const [closetUrls, setClosetUrls] = useState<Record<string, string>>({});
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Hydrate session cache for instant paint
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
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      setRecentlyShown(getRecentlySeen("shop", u));
      const [{ data: cat }, ci, fb] = await Promise.all([
        supabase
          .from("shop_catalog")
          .select(
            "id,name,brand,category,color,price,current_price,original_price,condition,image_url,formality,season,retailer,buy_url,availability,is_demo,created_at",
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
          : Promise.resolve({
              data: [] as { catalog_id: string; saved: boolean; dismissed: boolean }[],
            }),
      ]);
      const nextCatalog = (cat ?? []) as CatalogItem[];
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
      } catch {
        /* ignore */
      }
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
      setLastRefreshedAt(new Date());
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
    const filtered = catalog.filter((c) => {
      if (dismissed.has(c.id)) return false;
      if (c.availability === "out_of_stock") return false;
      if (source !== "all" && c.condition !== source) return false;
      const k = primaryKind(c.category);
      if (tab === "outfits") return k === "clothing" || k === "shoes" || k === "accessories";
      if (tab === "accessories") {
        if (k !== "accessories") return false;
        if (accSub !== "all" && accessorySubcategory(c) !== accSub) return false;
        return true;
      }
      if (tab === "fragrance") {
        if (k !== "fragrance") return false;
        if (fragFam !== "all" && fragranceFamily(c) !== fragFam) return false;
        return true;
      }
      return k === tab;
    });
    const s = scoreCatalog(filtered, closet, { recentlyShown, seed: refreshSeed });
    if (sort === "new") {
      return [...s].sort((a, b) => {
        const at = (a.item as CatalogItem & { created_at?: string }).created_at ?? "";
        const bt = (b.item as CatalogItem & { created_at?: string }).created_at ?? "";
        return bt.localeCompare(at);
      });
    }
    return s;
  }, [catalog, closet, source, tab, accSub, fragFam, sort, dismissed, recentlyShown, refreshSeed]);

  const visibleScored = useMemo(() => scored.slice(0, visible), [scored, visible]);

  const closetSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of closet) {
      const p = primarySlot(c.category);
      counts[p] = (counts[p] ?? 0) + 1;
    }
    const total = closet.length;
    if (total === 0) return "Add pieces to your closet so Shop can rank real gaps.";
    const targets: Array<[string, number, string]> = [
      ["top", 5, "tops"],
      ["bottom", 4, "bottoms"],
      ["outerwear", 2, "outerwear"],
      ["shoes", 3, "shoes"],
      ["accessory", 3, "accessories"],
    ];
    const gaps = targets
      .filter(([slot, tgt]) => (counts[slot] ?? 0) < tgt)
      .map(([, , label]) => label);
    const owned = `You own ${counts.top ?? 0} tops, ${counts.bottom ?? 0} bottoms, ${counts.shoes ?? 0} shoes, ${counts.accessory ?? 0} accessories.`;
    return gaps.length
      ? `${owned} Best next additions: ${gaps.slice(0, 3).join(", ")}.`
      : `${owned} Your core rotation is solid.`;
  }, [closet]);

  const outfitIdeas = useMemo(() => {
    if (tab !== "outfits") return [];
    return scored
      .filter((g) => g.matches.length > 0)
      .slice(0, 12)
      .map((g) => ({ pick: g, owned: g.matches.slice(0, 4) }));
  }, [tab, scored]);

  function refresh() {
    const topIds = scored.slice(0, 6).map((g) => g.item.id);
    const next = pushRecentlySeen("shop", topIds, uid);
    setRecentlyShown(next);
    setRefreshSeed((n) => n + 1);
    setVisible(INITIAL);
    setLastRefreshedAt(new Date());
  }

  async function feedback(id: string, action: "save" | "dismiss") {
    if (!uid) return toast.error("Sign in to save");
    const saveFlag = action === "save";
    const dismissFlag = action === "dismiss";
    const { error } = await supabase
      .from("shop_feedback")
      .upsert(
        { user_id: uid, catalog_id: id, liked: saveFlag, saved: saveFlag, dismissed: dismissFlag },
        { onConflict: "user_id,catalog_id" },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    if (dismissFlag) {
      setDismissed((s) => new Set(s).add(id));
      setSaved((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
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

      {/* Primary tabs */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 scrollbar-hide">
        {PRIMARY_TABS.map((t) => (
          <button
            key={t.v}
            onClick={() => {
              setTab(t.v);
              setVisible(INITIAL);
              setAccSub("all");
              setFragFam("all");
            }}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest ${
              tab === t.v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80 hover:bg-surface-2"
            }`}
          >
            {t.v === "outfits" ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : t.v === "accessories" ? (
              <Layers className="h-3.5 w-3.5" />
            ) : null}
            {t.l}
          </button>
        ))}
      </div>

      {/* Secondary chip row */}
      {tab === "accessories" && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 scrollbar-hide">
          {ACC_SUBS.map((s) => (
            <button
              key={s.v}
              onClick={() => {
                setAccSub(s.v);
                setVisible(INITIAL);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
                accSub === s.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground/80"
              }`}
            >
              {s.l}
            </button>
          ))}
        </div>
      )}
      {tab === "fragrance" && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 scrollbar-hide">
          {FRAG_FAMS.map((s) => (
            <button
              key={s.v}
              onClick={() => {
                setFragFam(s.v);
                setVisible(INITIAL);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
                fragFam === s.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground/80"
              }`}
            >
              {s.l}
            </button>
          ))}
        </div>
      )}

      {/* Condition + refresh toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-5 flex flex-1 gap-2 overflow-x-auto px-5 scrollbar-hide">
          {CONDITIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSource(s);
                setVisible(INITIAL);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
                source === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground/80"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "gap" | "new")}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] uppercase tracking-widest"
          >
            <option value="gap">Best gap fit</option>
            <option value="new">New arrivals</option>
          </select>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Last refreshed{" "}
        {lastRefreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : tab === "outfits" ? (
        outfitIdeas.length === 0 ? (
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
        )
      ) : scored.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          No matches in this filter. Try Refresh or a different tab.
        </div>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {scored.length} result{scored.length === 1 ? "" : "s"}
          </p>
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
      )}
    </div>
  );
}

function ItemCard({
  g,
  saved,
  onSave,
  onDismiss,
  eager,
}: {
  g: GapScore;
  saved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  eager?: boolean;
}) {
  const validBuy = hasValidBuyUrl(g.item);
  return (
    <li className="card-surface overflow-hidden flex flex-col">
      <CatalogImage
        src={g.item.image_url}
        alt={g.item.name}
        category={g.item.category}
        className="aspect-square"
        eager={eager}
      />
      <div className="relative -mt-8 flex justify-between px-2 pointer-events-none">
        {g.item.is_demo ? (
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Demo
          </span>
        ) : <span />}
        <span className="rounded-full border border-primary/40 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
          Fit {(g.score * 100).toFixed(0)}
        </span>
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
            <li key={i} className="text-xs text-muted-foreground">
              · {r}
            </li>
          ))}
        </ul>
        {g.matches.length > 0 && (
          <p className="text-[11px] text-foreground/70">
            Pairs with:{" "}
            <span className="text-foreground/90">
              {g.matches
                .slice(0, 3)
                .map((m) => m.name)
                .join(", ")}
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
          <Link
            to="/inspo"
            search={{ item: g.item.id }}
            className="rounded-full border border-primary/60 px-3 py-1.5 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10 inline-flex items-center gap-1"
          >
            <Sparkles className="h-3 w-3" /> Build around this
          </Link>
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
            <div
              key={o.id}
              className="aspect-square bg-surface-2 relative rounded-md overflow-hidden"
            >
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
          <Link
            to="/inspo"
            search={{ item: g.item.id }}
            className="rounded-full border border-primary/60 px-3 py-1.5 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10 inline-flex items-center gap-1"
          >
            <Sparkles className="h-3 w-3" /> Build around this
          </Link>
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
