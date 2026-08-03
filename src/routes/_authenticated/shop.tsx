import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  scoreCatalog,
  accessorySubcategory,
  fragranceFamily,
  isAccessoryCategory,
  ACCESSORY_SUBTYPE_FILTERS,
  type CatalogItem,
  type GapScore,
  type AccessorySub,
  type FragranceFamily,
} from "@/lib/shop-gap";
import {
  catalogWindowSize,
  catalogMatchesScope,
  dedupeCatalog,
  prioritizeUnseenCatalog,
  productActionFor,
  shouldShowVerifiedInventoryEmpty,
  isVerifiedPurchasable,
  rankCatalogForScope,
  type ShopScope,
  type VerifiableCatalogItem,
} from "@/lib/shop-catalog";
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

const CACHE_KEY = "drip.shop.cache.v6";
const PAGE_SIZE = 12;
const INITIAL = 12;

function primaryKind(cat: string): PrimaryTab | "other" {
  const c = cat.toLowerCase();
  if (
    ["shoes", "sneaker", "jordan", "vomero", "new_balance", "loafer", "boot", "runner"].includes(c)
  )
    return "shoes";
  if (isAccessoryCategory(c)) return "accessories";
  if (
    ["fragrance", "scent", "perfume", "cologne", "edt", "edp", "parfum", "decant"].includes(c) ||
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
  if (isAccessoryCategory(c)) return "accessory";
  return "other";
}

function ShopPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<(typeof CONDITIONS)[number]>("all");
  const [scope, setScope] = useState<ShopScope>("verified");
  const [showHow, setShowHow] = useState(false);
  const [tab, setTab] = useState<PrimaryTab>("clothing");
  const [accSub, setAccSub] = useState<AccessorySub | "all">("all");
  const [fragFam, setFragFam] = useState<FragranceFamily | "all">("all");
  const [sort, setSort] = useState<"gap" | "new">("gap");
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [recentlyShown, setRecentlyShown] = useState<Set<string>>(new Set());
  const [immediatelyShown, setImmediatelyShown] = useState<Set<string>>(new Set());
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
          .select("*")
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
      const nextCatalog = dedupeCatalog((cat ?? []) as CatalogItem[]);
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

  const distinctCatalog = useMemo(() => dedupeCatalog(catalog), [catalog]);

  const scored: GapScore[] = useMemo(() => {
    const filtered = distinctCatalog.filter((c) => {
      if (dismissed.has(c.id)) return false;
      // Archived items are admin-hidden from Shop entirely, regardless of scope.
      if ((c as CatalogItem & { archived?: boolean }).archived === true) return false;
      if (!catalogMatchesScope(c as VerifiableCatalogItem, scope)) return false;
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
    let ordered: GapScore[];
    if (sort === "new") {
      ordered = prioritizeUnseenCatalog(
        [...s].sort((a, b) => {
          const at = (a.item as CatalogItem & { created_at?: string }).created_at ?? "";
          const bt = (b.item as CatalogItem & { created_at?: string }).created_at ?? "";
          return bt.localeCompare(at);
        }),
        immediatelyShown,
      );
    } else {
      ordered = prioritizeUnseenCatalog(s, immediatelyShown);
    }
    return rankCatalogForScope(ordered as Array<GapScore & { item: VerifiableCatalogItem }>, scope);
  }, [
    distinctCatalog,
    closet,
    source,
    scope,
    tab,
    accSub,
    fragFam,
    sort,
    dismissed,
    recentlyShown,
    refreshSeed,
    immediatelyShown,
  ]);

  const visibleLimit =
    visible === INITIAL
      ? catalogWindowSize(scored.length, INITIAL)
      : Math.min(visible, scored.length);
  const visibleScored = useMemo(() => scored.slice(0, visibleLimit), [scored, visibleLimit]);

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
    const shownIds =
      tab === "outfits"
        ? outfitIdeas.map(({ pick }) => pick.item.id)
        : visibleScored.map((g) => g.item.id);
    const next = pushRecentlySeen("shop", shownIds, uid);
    setImmediatelyShown(new Set(shownIds));
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
            DEMO catalog — sample products are not verified inventory and are not available for
            purchase. Retailer links will only appear after verification.
          </p>
        )}
        <button
          onClick={() => setShowHow((v) => !v)}
          className="mt-2 text-[11px] uppercase tracking-widest text-primary hover:underline"
        >
          {showHow ? "Hide" : "How DRIP Shop works"}
        </button>
        {showHow && (
          <div className="mt-2 space-y-1 rounded-md border border-border/70 bg-surface-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              <span className="text-foreground">Demo concepts</span> preview the gap engine and are
              not for purchase. They always stay labeled DEMO and Sample only.
            </p>
            <p>
              <span className="text-foreground">Verified products</span> meet DRIP&apos;s strict
              freshness and provenance checks. Shop now opens an outside retailer; prices and
              availability may change after the displayed last-checked time.
            </p>
            <p>
              Affiliate relationships are disclosed on the product card. Recommendations are
              rule-based using closet compatibility, and DRIP may recommend not buying a duplicate
              or low-value addition.
            </p>
          </div>
        )}
      </div>

      {/* Scope selector */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {(
          [
            { v: "verified", l: "Verified products" },
            { v: "demo", l: "Demo concepts" },
            { v: "all", l: "All" },
          ] as const
        ).map((s) => (
          <button
            key={s.v}
            onClick={() => {
              setScope(s.v);
              setVisible(INITIAL);
            }}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
              scope === s.v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80"
            }`}
          >
            {s.l}
          </button>
        ))}
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
          {ACCESSORY_SUBTYPE_FILTERS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setAccSub(s.value);
                setVisible(INITIAL);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
                accSub === s.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground/80"
              }`}
            >
              {s.label}
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
      ) : shouldShowVerifiedInventoryEmpty(scope, scored.length) ? (
        <VerifiedInventoryEmpty />
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
            {visibleScored.map((g, i) => (
              <ItemCard
                key={g.item.id}
                g={g}
                eager={i < 3}
                saved={saved.has(g.item.id)}
                onSave={() => feedback(g.item.id, "save")}
                onDismiss={() => feedback(g.item.id, "dismiss")}
              />
            ))}
          </ul>
          {visibleLimit < scored.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisible(visibleLimit + PAGE_SIZE)}
                className="rounded-full border border-border px-5 py-2 text-xs uppercase tracking-widest hover:bg-surface-2"
              >
                Load more ({scored.length - visibleLimit})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VerifiedInventoryEmpty() {
  return (
    <div className="card-surface p-6 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">No verified products yet.</p>
      <p className="mt-2">
        Verified products will appear after authorized retailer, affiliate, partner, or manually
        verified inventory is approved.
      </p>
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
  const item = g.item as VerifiableCatalogItem;
  const productAction = productActionFor(item);
  const verified = isVerifiedPurchasable(item);
  return (
    <li className="card-surface overflow-hidden flex flex-col">
      <CatalogImage
        src={g.item.image_url}
        alt={g.item.name}
        category={g.item.category}
        isDemo={g.item.is_demo}
        className="aspect-square"
        eager={eager}
      />
      <div className="relative -mt-8 flex justify-between px-2 pointer-events-none">
        {g.item.is_demo ? (
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            Demo
          </span>
        ) : (
          <span />
        )}
        <span className="rounded-full border border-primary/40 bg-background/80 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
          Fit {(g.score * 100).toFixed(0)}
        </span>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div>
          <p className="line-clamp-1 text-sm font-medium">{g.item.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {[g.item.brand, g.item.is_demo ? "Sample only" : g.item.retailer, g.item.condition]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {g.item.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-foreground/70">
            {g.item.description}
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {[g.item.color, g.item.material, g.item.vibe, g.item.price_tier]
            .filter(Boolean)
            .map((detail) => (
              <span
                key={detail}
                className="rounded-full border border-border/70 px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground"
              >
                {detail}
              </span>
            ))}
        </div>
        {(g.item.current_price ?? g.item.price) != null && (
          <p className="font-display text-lg text-primary">
            {formatProductPrice(g.item.current_price ?? g.item.price, g.item.currency)}
            {g.item.original_price &&
              g.item.current_price &&
              g.item.original_price > g.item.current_price && (
                <span className="ml-2 text-xs text-muted-foreground line-through">
                  {formatProductPrice(g.item.original_price, g.item.currency)}
                </span>
              )}
          </p>
        )}
        {verified && <VerifiedProductMetadata item={item} />}
        <p className="text-[10px] uppercase tracking-widest text-foreground/75">
          Estimated outfits unlocked: {g.outfitsUnlocked}
        </p>
        {g.duplicate && (
          <p className="flex items-center gap-1 text-[11px] text-destructive">
            <AlertTriangle className="h-3 w-3" /> {g.duplicateNote}
          </p>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-foreground/80">
            Why this belongs in your closet
          </p>
          <ul className="mt-1 space-y-0.5">
            {g.reasons.map((r, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                · {r}
              </li>
            ))}
          </ul>
        </div>
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
          {productAction.kind === "retailer" ? (
            <a
              href={productAction.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn-lime !px-3 !py-1.5 text-[10px] inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> {productAction.label}
            </a>
          ) : (
            <span
              aria-disabled="true"
              title="Sample product — retailer availability has not been verified"
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1"
            >
              <Eye className="h-3 w-3" /> {productAction.label}
            </span>
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

function formatAvailability(value?: string | null): string {
  const labels: Record<string, string> = {
    in_stock: "In stock",
    low_stock: "Low stock",
    preorder: "Preorder",
    out_of_stock: "Out of stock",
    discontinued: "Discontinued",
  };
  return labels[value ?? ""] ?? "Not confirmed";
}

function formatCheckedAt(value?: string | null): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatProductPrice(
  value: number | null | undefined,
  currency: string | null | undefined = "USD",
): string {
  if (value === null || value === undefined) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency || "USD"} ${value.toFixed(2)}`;
  }
}

function formatSourceType(value?: string | null): string {
  const labels: Record<string, string> = {
    manual: "Manual verification",
    affiliate_feed: "Affiliate feed",
    partner_api: "Partner API",
    verified: "Verified source",
  };
  return labels[value ?? ""] ?? "Source recorded";
}

function VerifiedProductMetadata({ item }: { item: VerifiableCatalogItem }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border/70 bg-surface-2 p-2 text-[10px]">
      <dt className="uppercase tracking-widest text-muted-foreground">Retailer</dt>
      <dd className="text-right text-foreground/90">{item.retailer}</dd>
      <dt className="uppercase tracking-widest text-muted-foreground">Availability</dt>
      <dd className="text-right text-foreground/90">{formatAvailability(item.availability)}</dd>
      <dt className="uppercase tracking-widest text-muted-foreground">Last checked</dt>
      <dd className="text-right text-foreground/90">{formatCheckedAt(item.last_checked_at)}</dd>
      <dt className="uppercase tracking-widest text-muted-foreground">Source</dt>
      <dd className="text-right text-foreground/90">
        {[item.source_name, formatSourceType(item.source_type)].filter(Boolean).join(" · ")}
      </dd>
      {item.affiliate && (
        <>
          <dt className="uppercase tracking-widest text-muted-foreground">Affiliate</dt>
          <dd className="text-right text-foreground/90">{item.affiliate_disclosure}</dd>
        </>
      )}
    </dl>
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
  const item = g.item as VerifiableCatalogItem;
  const productAction = productActionFor(item);
  const verified = isVerifiedPurchasable(item);
  return (
    <li className="card-surface overflow-hidden">
      <div className="p-3">
        <p className="text-[10px] uppercase tracking-widest text-primary">Shop the outfit</p>
        <p className="mt-1 text-sm text-foreground/80">
          Adds ~{g.outfitsUnlocked} new combinations with pieces you own.
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1 px-3">
        <div className="col-span-2 relative rounded-md overflow-hidden">
          <CatalogImage
            src={g.item.image_url}
            alt={g.item.name}
            category={g.item.category}
            isDemo={g.item.is_demo}
            className="aspect-square"
          />
          <span className="absolute bottom-1 left-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary-foreground">
            New
          </span>
          {g.item.is_demo && (
            <span className="absolute top-1 left-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
              Demo
            </span>
          )}
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
            {[g.item.brand, g.item.is_demo ? "Sample only" : g.item.retailer, g.item.condition]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {(g.item.current_price ?? g.item.price) != null && (
          <p className="font-display text-lg text-primary">
            {formatProductPrice(g.item.current_price ?? g.item.price, g.item.currency)}
          </p>
        )}
        {verified && <VerifiedProductMetadata item={item} />}
        <div className="flex flex-wrap gap-2">
          {productAction.kind === "retailer" ? (
            <a
              href={productAction.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn-lime !px-3 !py-1.5 text-[10px] inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> {productAction.label}
            </a>
          ) : (
            <span
              aria-disabled="true"
              title="Sample product — retailer availability has not been verified"
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1"
            >
              <Eye className="h-3 w-3" /> {productAction.label}
            </span>
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
