import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import type { ClosetItem, Fragrance } from "@/lib/outfit-generator";
import { hasValidBuyUrl, type CatalogItem } from "@/lib/shop-gap";
import { toast } from "sonner";
import {
  Lock,
  Unlock,
  Shuffle,
  Save,
  Sparkles,
  ExternalLink,
  Plus,
  X,
  Undo2,
  ShoppingBag,
  Shirt,
} from "lucide-react";
import { StyleTabs } from "@/components/StyleTabs";
import { z } from "zod";

const searchSchema = z.object({
  item: z.string().optional(),
  slot: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/inspo")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [{ title: "Inspo Builder — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: InspoPage,
});

type SlotKey = "top" | "bottom" | "outerwear" | "shoes" | "acc1" | "acc2" | "acc3" | "fragrance";

type SlotKind = "top" | "bottom" | "outerwear" | "shoes" | "accessory" | "fragrance";

const SLOT_ORDER: SlotKey[] = [
  "top",
  "bottom",
  "outerwear",
  "shoes",
  "acc1",
  "acc2",
  "acc3",
  "fragrance",
];

const SLOT_KIND: Record<SlotKey, SlotKind> = {
  top: "top",
  bottom: "bottom",
  outerwear: "outerwear",
  shoes: "shoes",
  acc1: "accessory",
  acc2: "accessory",
  acc3: "accessory",
  fragrance: "fragrance",
};

const SLOT_LABEL: Record<SlotKey, string> = {
  top: "Top",
  bottom: "Bottom",
  outerwear: "Outerwear",
  shoes: "Shoes",
  acc1: "Accessory",
  acc2: "Accessory",
  acc3: "Accessory",
  fragrance: "Fragrance",
};

function primaryOfClosetCategory(cat: string): SlotKind | null {
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
    ].includes(c)
  )
    return "accessory";
  return null;
}

type Assignment =
  | { source: "closet"; id: string }
  | { source: "catalog"; id: string }
  | { source: "fragrance"; id: string };

type Selection = Partial<Record<SlotKey, Assignment>>;
type Source = "closet" | "shop" | "mix";

function InspoPage() {
  const search = Route.useSearch();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [fragrances, setFragrances] = useState<Fragrance[]>([]);

  const [selection, setSelection] = useState<Selection>({});
  const [locked, setLocked] = useState<Set<SlotKey>>(new Set());
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);
  const [source, setSource] = useState<Source>("mix");
  const [history, setHistory] = useState<Selection[]>([]);
  const [visibleAcc, setVisibleAcc] = useState(1); // 1, 2, or 3
  const [rotation, setRotation] = useState(0);

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      if (!u) return;
      const [{ data: items }, { data: cat }, { data: frs }] = await Promise.all([
        supabase
          .from("closet_items")
          .select("id,name,category,kind,color,material,fit,season,formality,brand,image_url")
          .eq("user_id", u)
          .eq("archived", false),
        supabase
          .from("shop_catalog")
          .select(
            "id,name,brand,category,color,price,current_price,original_price,condition,image_url,formality,season,retailer,buy_url,availability,is_demo",
          )
          .limit(120),
        supabase
          .from("fragrances")
          .select("id,name,brand,family,season,projection,longevity,occasions")
          .eq("user_id", u),
      ]);
      const list = (items ?? []).filter((i) => i.kind !== "fragrance") as ClosetItem[];
      setCloset(list);
      setCatalog((cat ?? []) as CatalogItem[]);
      setFragrances((frs ?? []) as Fragrance[]);
      setUrls(await getSignedUrlsByItem(list));
      setLoading(false);
    })();
  }, []);

  // Handle ?item=... locking a catalog item into an inferred slot
  useEffect(() => {
    if (initialized.current) return;
    if (loading) return;
    initialized.current = true;
    const itemId = search.item;
    if (!itemId) return;
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    const inferred = (search.slot as SlotKey | undefined) ?? inferSlotFromCategory(item.category);
    if (!inferred) return;
    setSelection((s) => ({ ...s, [inferred]: { source: "catalog", id: item.id } }));
    setLocked((l) => new Set(l).add(inferred));
    if (inferred === "acc2") setVisibleAcc((n) => Math.max(n, 2));
    if (inferred === "acc3") setVisibleAcc((n) => Math.max(n, 3));
    toast.success(
      `Locked "${item.name}" — auto-filled owned pieces around it.`,
    );
    // Auto-complete outfit with owned pieces once locked item is set.
    setTimeout(() => completeOutfit(), 50);
  }, [loading, catalog, search.item, search.slot]);

  const closetBySlot = useMemo(() => {
    const m: Record<SlotKind, ClosetItem[]> = {
      top: [],
      bottom: [],
      outerwear: [],
      shoes: [],
      accessory: [],
      fragrance: [],
    };
    for (const c of closet) {
      const p = primaryOfClosetCategory(c.category);
      if (p) m[p].push(c);
    }
    return m;
  }, [closet]);

  const catalogBySlot = useMemo(() => {
    const m: Record<SlotKind, CatalogItem[]> = {
      top: [],
      bottom: [],
      outerwear: [],
      shoes: [],
      accessory: [],
      fragrance: [],
    };
    for (const c of catalog) {
      const kind =
        c.category.toLowerCase() === "fragrance" ||
        /perfume|cologne|scent/.test(c.category.toLowerCase())
          ? "fragrance"
          : primaryOfClosetCategory(c.category);
      if (kind) m[kind].push(c);
    }
    return m;
  }, [catalog]);

  function pushHistory() {
    setHistory((h) => [...h.slice(-9), selection]);
    setSavedId(null);
  }

  function assignFromClosetItem(slot: SlotKey, item: ClosetItem) {
    pushHistory();
    setSelection((s) => ({ ...s, [slot]: { source: "closet", id: item.id } }));
    setActiveSlot(null);
  }
  function assignFromCatalog(slot: SlotKey, item: CatalogItem) {
    pushHistory();
    setSelection((s) => ({ ...s, [slot]: { source: "catalog", id: item.id } }));
    setActiveSlot(null);
  }
  function assignFromFragrance(slot: SlotKey, item: Fragrance) {
    pushHistory();
    setSelection((s) => ({ ...s, [slot]: { source: "fragrance", id: item.id } }));
    setActiveSlot(null);
  }
  function clearSlot(slot: SlotKey) {
    pushHistory();
    setSelection((s) => {
      const n = { ...s };
      delete n[slot];
      return n;
    });
    setLocked((l) => {
      const n = new Set(l);
      n.delete(slot);
      return n;
    });
  }
  function toggleLock(slot: SlotKey) {
    setLocked((l) => {
      const n = new Set(l);
      if (n.has(slot)) n.delete(slot);
      else n.add(slot);

      return n;
    });
  }
  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setSelection(prev);
      return h.slice(0, -1);
    });
  }

  function pickForSlot(slot: SlotKey, seed = rotation) {
    const kind = SLOT_KIND[slot];
    if (kind === "fragrance") {
      const pool = fragrances;
      if (pool.length) return { source: "fragrance" as const, id: pool[seed % pool.length].id };
      const shop = catalogBySlot.fragrance;
      if (shop.length) return { source: "catalog" as const, id: shop[seed % shop.length].id };
      return null;
    }
    const owned = closetBySlot[kind];
    if (owned.length) return { source: "closet" as const, id: owned[seed % owned.length].id };
    const shop = catalogBySlot[kind];
    if (shop.length) return { source: "catalog" as const, id: shop[seed % shop.length].id };
    return null;
  }

  const emptySlots = useMemo(
    () =>
      SLOT_ORDER.filter((s) => {
        if (selection[s]) return false;
        if (s === "acc2" && visibleAcc < 2) return false;
        if (s === "acc3" && visibleAcc < 3) return false;
        return true;
      }),
    [selection, visibleAcc],
  );

  function suggestNext() {
    const target =
      activeSlot && !locked.has(activeSlot) && !selection[activeSlot] ? activeSlot : emptySlots[0];
    if (!target) {
      toast("Every slot is filled.");
      return;
    }
    const pick = pickForSlot(target, rotation);
    if (!pick) {
      toast(`No ${SLOT_LABEL[target].toLowerCase()} in your closet or shop.`);
      return;
    }
    pushHistory();
    setSelection((s) => ({ ...s, [target]: pick }));
    setRotation((r) => r + 1);
  }

  function completeOutfit() {
    pushHistory();
    const next: Selection = { ...selection };
    let changed = false;
    for (const slot of SLOT_ORDER) {
      if (locked.has(slot)) continue;
      if (next[slot]) continue;
      if (slot === "acc2" && visibleAcc < 2) continue;
      if (slot === "acc3" && visibleAcc < 3) continue;
      const pick = pickForSlot(slot, rotation + slot.charCodeAt(0));
      if (pick) {
        next[slot] = pick;
        changed = true;
      }
    }
    if (!changed) toast("Nothing to add.");
    setSelection(next);
    setRotation((r) => r + 1);
  }

  function shuffleUnlocked() {
    pushHistory();
    const next: Selection = {};
    for (const slot of SLOT_ORDER) {
      if (locked.has(slot) && selection[slot]) next[slot] = selection[slot]!;
    }
    for (const slot of SLOT_ORDER) {
      if (next[slot]) continue;
      if (slot === "acc2" && visibleAcc < 2) continue;
      if (slot === "acc3" && visibleAcc < 3) continue;
      const pick = pickForSlot(slot, rotation + slot.charCodeAt(0) + 7);
      if (pick) next[slot] = pick;
    }
    setSelection(next);
    setRotation((r) => r + 3);
  }

  // Resolvers ---------------------------------------------------------------
  function resolveClosetItem(id: string) {
    return closet.find((c) => c.id === id);
  }
  function resolveCatalog(id: string) {
    return catalog.find((c) => c.id === id);
  }
  function resolveFragrance(id: string) {
    return fragrances.find((f) => f.id === id);
  }

  const unownedTotal = useMemo(() => {
    let total = 0;
    for (const s of SLOT_ORDER) {
      const a = selection[s];
      if (!a || a.source !== "catalog") continue;
      const it = resolveCatalog(a.id);
      const price = it?.current_price ?? it?.price ?? 0;
      total += Number(price ?? 0);
    }
    return total;
  }, [selection, catalog]);

  const chosenClosetPieces = useMemo(
    () =>
      SLOT_ORDER.map((s) => selection[s])
        .filter((a): a is Assignment => !!a && a.source === "closet")
        .map((a) => resolveClosetItem(a.id))
        .filter((c): c is ClosetItem => !!c),
    [selection, closet],
  );

  async function save() {
    if (!uid) return;
    if (chosenClosetPieces.length < 2) {
      toast.error("Add at least two owned pieces to save.");
      return;
    }
    setSaving(true);
    const { data: outfit, error } = await supabase
      .from("saved_outfits")
      .insert({
        user_id: uid,
        name: `Inspo · ${new Date().toISOString().slice(0, 10)}`,
        vibe: "Inspo",
        visibility: "private",
        explanation: "Built in Inspo Builder",
      })
      .select("id")
      .single();
    if (error || !outfit) {
      setSaving(false);
      return toast.error(error?.message ?? "Save failed");
    }
    const rows = SLOT_ORDER.map((s) => ({ slot: s, a: selection[s] }))
      .filter((r) => r.a && r.a.source === "closet")
      .map((r) => ({
        outfit_id: outfit.id,
        closet_item_id: (r.a as { id: string }).id,
        role: SLOT_KIND[r.slot as SlotKey],
      }));
    const { error: ie } = await supabase.from("outfit_items").insert(rows);
    if (ie) {
      await supabase.from("saved_outfits").delete().eq("id", outfit.id);
      setSaving(false);
      return toast.error(`Could not save pieces: ${ie.message}`);
    }
    setSavedId(outfit.id);
    setSaving(false);
    toast.success("Saved to Saved Outfits");
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <StyleTabs />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      <StyleTabs />
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Build a look</p>
        <h1 className="mt-1 font-display text-4xl">Inspo Builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap any slot to pick from your Closet, Shop, or a Mix. Lock what you love.
        </p>
      </div>

      {closet.length === 0 && catalog.length === 0 ? (
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">Add closet pieces to start building.</p>
          <Link to="/closet/new" className="btn-lime mt-4 inline-flex">
            Add a piece
          </Link>
        </div>
      ) : (
        <>
          {/* Outfit slot grid */}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SLOT_ORDER.filter((s) => {
              if (s === "acc2" && visibleAcc < 2 && !selection.acc2) return false;
              if (s === "acc3" && visibleAcc < 3 && !selection.acc3) return false;
              return true;
            }).map((slot) => (
              <SlotCard
                key={slot}
                slot={slot}
                active={activeSlot === slot}
                assignment={selection[slot]}
                locked={locked.has(slot)}
                closetImg={(id) => urls[id]}
                resolveClosetItem={resolveClosetItem}
                resolveCatalog={resolveCatalog}
                resolveFragrance={resolveFragrance}
                onOpen={() => setActiveSlot(slot)}
                onClear={() => clearSlot(slot)}
                onLock={() => toggleLock(slot)}
              />
            ))}
            {visibleAcc < 3 && (
              <li>
                <button
                  onClick={() => setVisibleAcc((n) => Math.min(3, n + 1))}
                  className="flex h-full min-h-[10rem] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-surface-2"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px] uppercase tracking-widest">
                    Add another accessory
                  </span>
                </button>
              </li>
            )}
          </ul>

          {/* Unowned subtotal */}
          {unownedTotal > 0 && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
              Recommended pieces subtotal:{" "}
              <span className="font-semibold">${unownedTotal.toFixed(0)}</span>
              <span className="ml-2 text-muted-foreground">(owned pieces excluded)</span>
            </div>
          )}

          {/* Suggestion tray */}
          {activeSlot && (
            <SuggestionTray
              slot={activeSlot}
              source={source}
              setSource={setSource}
              closetItems={closetBySlot[SLOT_KIND[activeSlot]]}
              catalogItems={catalogBySlot[SLOT_KIND[activeSlot]]}
              fragrances={SLOT_KIND[activeSlot] === "fragrance" ? fragrances : []}
              urls={urls}
              onPickCloset={(c) => assignFromClosetItem(activeSlot, c)}
              onPickCatalog={(c) => assignFromCatalog(activeSlot, c)}
              onPickFragrance={(f) => assignFromFragrance(activeSlot, f)}
              onClose={() => setActiveSlot(null)}
            />
          )}

          {/* Save */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={saving || chosenClosetPieces.length < 2}
              className="btn-lime inline-flex items-center gap-1 disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save outfit"}
            </button>
            {savedId && (
              <Link
                to="/saved"
                className="text-xs uppercase tracking-widest text-primary hover:underline"
              >
                View in Saved →
              </Link>
            )}
          </div>
        </>
      )}

      {/* Sticky action bar (always visible if any empty non-locked slot) */}
      {emptySlots.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <button
              onClick={suggestNext}
              className="btn-lime inline-flex items-center gap-1 !px-3 !py-2 text-xs"
            >
              <Sparkles className="h-4 w-4" /> Suggest next piece
            </button>
            <button
              onClick={completeOutfit}
              className="inline-flex items-center gap-1 rounded-full border border-primary px-3 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5" /> Complete outfit
            </button>
            <button
              onClick={shuffleUnlocked}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-surface-2"
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </button>
            <button
              onClick={undo}
              disabled={!history.length}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-surface-2 disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
              {emptySlots.length} slot{emptySlots.length === 1 ? "" : "s"} empty
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function inferSlotFromCategory(cat: string): SlotKey | null {
  const p = primaryOfClosetCategory(cat);
  if (p === "top") return "top";
  if (p === "bottom") return "bottom";
  if (p === "outerwear") return "outerwear";
  if (p === "shoes") return "shoes";
  if (p === "accessory") return "acc1";
  if (/(fragrance|perfume|cologne|scent)/i.test(cat)) return "fragrance";
  return null;
}

function SlotCard({
  slot,
  active,
  assignment,
  locked,
  closetImg,
  resolveClosetItem,
  resolveCatalog,
  resolveFragrance,
  onOpen,
  onClear,
  onLock,
}: {
  slot: SlotKey;
  active: boolean;
  assignment: Assignment | undefined;
  locked: boolean;
  closetImg: (id: string) => string | undefined;
  resolveClosetItem: (id: string) => ClosetItem | undefined;
  resolveCatalog: (id: string) => CatalogItem | undefined;
  resolveFragrance: (id: string) => Fragrance | undefined;
  onOpen: () => void;
  onClear: () => void;
  onLock: () => void;
}) {
  let image: string | undefined;
  let name = "";
  let badge: { label: string; className: string } | null = null;
  if (assignment?.source === "closet") {
    const it = resolveClosetItem(assignment.id);
    if (it) {
      image = closetImg(it.id);
      name = it.name;
      badge = { label: "Owned", className: "text-primary" };
    }
  } else if (assignment?.source === "catalog") {
    const it = resolveCatalog(assignment.id);
    if (it) {
      image = it.image_url ?? undefined;
      name = it.name;
      badge = { label: "Buy", className: "text-primary" };
    }
  } else if (assignment?.source === "fragrance") {
    const it = resolveFragrance(assignment.id);
    if (it) {
      name = it.name;
      badge = { label: "Owned", className: "text-primary" };
    }
  }

  return (
    <li className={`card-surface overflow-hidden ${active ? "ring-2 ring-primary" : ""}`}>
      <button
        onClick={onOpen}
        aria-label={
          assignment ? `Change ${SLOT_LABEL[slot]}` : `Add ${SLOT_LABEL[slot].toLowerCase()}`
        }
        className="relative block aspect-square w-full bg-surface-2 text-left"
      >
        {image ? (
          <img src={image} alt={name} loading="lazy" className="h-full w-full object-cover" />
        ) : assignment ? (
          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            {name}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Plus className="h-6 w-6" />
            <span className="text-[10px] uppercase tracking-widest">
              Add {SLOT_LABEL[slot].toLowerCase()}
            </span>
          </div>
        )}
        <span className="absolute top-1 left-1 rounded-full bg-background/85 px-2 py-0.5 text-[9px] uppercase tracking-widest text-foreground/80">
          {SLOT_LABEL[slot]}
        </span>
        {badge && (
          <span
            className={`absolute top-1 right-1 rounded-full bg-background/85 px-2 py-0.5 text-[9px] uppercase tracking-widest ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
      </button>
      {assignment && (
        <div className="flex flex-wrap gap-1 p-2">
          <button
            onClick={onOpen}
            className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-widest hover:bg-surface-2"
          >
            Swap
          </button>
          <button
            onClick={onLock}
            className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-widest ${
              locked
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-surface-2"
            }`}
          >
            {locked ? (
              <>
                <Lock className="mr-1 inline h-2.5 w-2.5" />
                Locked
              </>
            ) : (
              <>
                <Unlock className="mr-1 inline h-2.5 w-2.5" />
                Lock
              </>
            )}
          </button>
          <button
            onClick={onClear}
            className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-widest hover:bg-surface-2"
          >
            Clear
          </button>
        </div>
      )}
    </li>
  );
}

function SuggestionTray({
  slot,
  source,
  setSource,
  closetItems,
  catalogItems,
  fragrances,
  urls,
  onPickCloset,
  onPickCatalog,
  onPickFragrance,
  onClose,
}: {
  slot: SlotKey;
  source: Source;
  setSource: (s: Source) => void;
  closetItems: ClosetItem[];
  catalogItems: CatalogItem[];
  fragrances: Fragrance[];
  urls: Record<string, string>;
  onPickCloset: (c: ClosetItem) => void;
  onPickCatalog: (c: CatalogItem) => void;
  onPickFragrance: (f: Fragrance) => void;
  onClose: () => void;
}) {
  const isFragrance = SLOT_KIND[slot] === "fragrance";
  const showCloset = source === "closet" || source === "mix";
  const showShop = source === "shop" || source === "mix";
  const shopItems = catalogItems;

  return (
    <div className="card-surface p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <span className="font-display text-lg">Pick a {SLOT_LABEL[slot].toLowerCase()}</span>
        </p>
        <button
          onClick={onClose}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 inline h-3 w-3" /> Close
        </button>
      </div>

      <div className="flex gap-2">
        {(["closet", "shop", "mix"] as Source[]).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-widest ${
              source === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80 hover:bg-surface-2"
            }`}
          >
            {s === "closet" ? (
              <>
                <Shirt className="h-3 w-3" /> My Closet
              </>
            ) : s === "shop" ? (
              <>
                <ShoppingBag className="h-3 w-3" /> Shop
              </>
            ) : (
              "Mix"
            )}
          </button>
        ))}
      </div>

      {isFragrance && showCloset && (
        <FragranceGrid fragrances={fragrances} onPick={onPickFragrance} />
      )}

      {!isFragrance && showCloset && (
        <ClosetGrid items={closetItems} urls={urls} onPick={onPickCloset} />
      )}

      {showShop && shopItems.length > 0 && <CatalogGrid items={shopItems} onPick={onPickCatalog} />}

      {showCloset && !isFragrance && closetItems.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No {SLOT_LABEL[slot].toLowerCase()}s in your closet.{" "}
          <Link to="/closet/new" className="text-primary underline">
            Add one
          </Link>
        </p>
      )}
    </div>
  );
}

function ClosetGrid({
  items,
  urls,
  onPick,
}: {
  items: ClosetItem[];
  urls: Record<string, string>;
  onPick: (c: ClosetItem) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        From your closet
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onPick(c)}
              className="card-surface w-full overflow-hidden text-left"
            >
              <div className="aspect-square bg-surface-2 relative">
                {urls[c.id] ? (
                  <img
                    src={urls[c.id]}
                    alt={c.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-1 text-center text-[9px] text-muted-foreground">
                    {c.name}
                  </div>
                )}
                <span className="absolute top-1 left-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary">
                  Owned
                </span>
              </div>
              <p className="line-clamp-1 p-1.5 text-[11px]">{c.name}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CatalogGrid({
  items,
  onPick,
}: {
  items: CatalogItem[];
  onPick: (c: CatalogItem) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        From the Shop — not owned
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.slice(0, 16).map((c) => (
          <li key={c.id} className="card-surface overflow-hidden">
            <div className="aspect-square bg-surface-2 relative">
              {c.image_url ? (
                <img
                  src={c.image_url}
                  alt={c.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-1 text-center text-[9px] text-muted-foreground">
                  {c.name}
                </div>
              )}
              <span className="absolute top-1 left-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary">
                Buy · ${c.current_price ?? c.price ?? "—"}
              </span>
            </div>
            <div className="space-y-1 p-2">
              <p className="line-clamp-1 text-[11px]">{c.name}</p>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                {[c.brand, c.retailer].filter(Boolean).join(" · ")}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => onPick(c)}
                  className="flex-1 rounded-full border border-primary bg-primary/10 py-1 text-[9px] uppercase tracking-widest text-primary hover:bg-primary/20"
                >
                  Add to builder
                </button>
                {hasValidBuyUrl(c) && (
                  <a
                    href={c.buy_url!}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    aria-label={`Buy ${c.name}`}
                    className="rounded-full border border-border px-2 py-1 text-[9px] uppercase tracking-widest hover:bg-surface-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FragranceGrid({
  fragrances,
  onPick,
}: {
  fragrances: Fragrance[];
  onPick: (f: Fragrance) => void;
}) {
  if (!fragrances.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No fragrances in your collection yet.{" "}
        <Link to="/scents" className="text-primary underline">
          Add one
        </Link>
      </p>
    );
  }
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Your shelf</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {fragrances.map((f) => (
          <li key={f.id}>
            <button onClick={() => onPick(f)} className="card-surface w-full p-2 text-left">
              <p className="text-xs font-medium line-clamp-1">{f.name}</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                {[f.brand, f.family].filter(Boolean).join(" · ") || "fragrance"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
