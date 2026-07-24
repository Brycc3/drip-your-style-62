import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import type { ClosetItem } from "@/lib/outfit-generator";
import { scoreCatalog, hasValidBuyUrl, type CatalogItem } from "@/lib/shop-gap";
import { toast } from "sonner";
import {
  Lock,
  Unlock,
  Shuffle,
  Save,
  Sparkles,
  Bookmark,
  ExternalLink,
  X,
} from "lucide-react";
import { StyleTabs } from "@/components/StyleTabs";

export const Route = createFileRoute("/_authenticated/inspo")({
  head: () => ({
    meta: [{ title: "Inspo Builder — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: InspoPage,
});

type Slot = "top" | "bottom" | "outerwear" | "shoes" | "accessory";
const SLOTS: Slot[] = ["top", "bottom", "outerwear", "shoes", "accessory"];
const SLOT_LABEL: Record<Slot, string> = {
  top: "Top",
  bottom: "Bottom",
  outerwear: "Outerwear",
  shoes: "Shoes",
  accessory: "Accessory",
};

function primary(cat: string): Slot | "other" {
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
      "accessory","hat","cap","beanie","belt","watch","chain","bracelet","ring","bag",
      "sunglasses","tie","socks","grill",
    ].includes(c)
  )
    return "accessory";
  return "other";
}

const F: Record<string, number> = { loungewear: 0, casual: 1, smart_casual: 2, business: 3, formal: 4 };
function pairs(a: { formality: string | null }, b: { formality: string | null }): boolean {
  const fa = F[a.formality ?? "casual"] ?? 1;
  const fb = F[b.formality ?? "casual"] ?? 1;
  return Math.abs(fa - fb) <= 1;
}

type Selection = Partial<Record<Slot, string>>; // slot -> closet_item_id (or catalog: id string)
type Recommended = { slot: Slot; item: CatalogItem };

function InspoPage() {
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selection, setSelection] = useState<Selection>({});
  const [locked, setLocked] = useState<Set<Slot>>(new Set());
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [recommend, setRecommend] = useState<Recommended | null>(null);
  const [addNewMode, setAddNewMode] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      if (!u) return;
      const [{ data: items }, { data: cat }] = await Promise.all([
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
          .limit(80),
      ]);
      const list = (items ?? []).filter((i) => i.kind !== "fragrance") as ClosetItem[];
      setCloset(list);
      setCatalog((cat ?? []) as CatalogItem[]);
      setUrls(await getSignedUrlsByItem(list));
      setLoading(false);
    })();
  }, []);

  const bySlot = useMemo(() => {
    const map: Record<Slot, ClosetItem[]> = {
      top: [], bottom: [], outerwear: [], shoes: [], accessory: [],
    };
    for (const c of closet) {
      const p = primary(c.category);
      if (p !== "other") map[p].push(c);
    }
    return map;
  }, [closet]);

  const selected: Partial<Record<Slot, ClosetItem>> = useMemo(() => {
    const out: Partial<Record<Slot, ClosetItem>> = {};
    for (const s of SLOTS) {
      const id = selection[s];
      if (id) {
        const found = closet.find((c) => c.id === id);
        if (found) out[s] = found;
      }
    }
    return out;
  }, [selection, closet]);

  const chosenPieces = useMemo(
    () => SLOTS.map((s) => selected[s]).filter((c): c is ClosetItem => !!c),
    [selected],
  );

  const rationale = useMemo(() => {
    const notes: string[] = [];
    if (chosenPieces.length < 2) return notes;
    const colors = chosenPieces.map((c) => c.color).filter(Boolean) as string[];
    const uniqueColors = Array.from(new Set(colors));
    if (uniqueColors.length <= 2) notes.push(`Tight palette (${uniqueColors.join(", ")}) reads considered.`);
    else notes.push(`Palette: ${uniqueColors.join(", ")}.`);
    const formalities = chosenPieces
      .map((c) => F[c.formality ?? "casual"] ?? 1);
    const spread = Math.max(...formalities) - Math.min(...formalities);
    notes.push(
      spread <= 1 ? "Formality lines up cleanly." : "Mixed formality — dress the middle piece as the anchor.",
    );
    const fits = new Set(chosenPieces.map((c) => c.fit).filter(Boolean));
    if (fits.size > 1)
      notes.push(`Silhouette contrast: ${Array.from(fits).join(" + ")} balances proportions.`);
    return notes;
  }, [chosenPieces]);

  function toggleLock(s: Slot) {
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function assign(slot: Slot, itemId: string) {
    setSelection((s) => ({ ...s, [slot]: itemId }));
    setPickerSlot(null);
    setRotation((r) => r + 1);
    setSavedId(null);
  }

  function clearSlot(slot: Slot) {
    setSelection((s) => {
      const next = { ...s };
      delete next[slot];
      return next;
    });
    setLocked((prev) => {
      const next = new Set(prev);
      next.delete(slot);
      return next;
    });
    setSavedId(null);
  }

  function suggestOne() {
    // Pick first missing slot, choose best-pairing owned item
    const missing = SLOTS.find((s) => !selection[s] && bySlot[s].length > 0);
    if (!missing) {
      toast("Every slot has a piece. Try Complete my fit.");
      return;
    }
    const anchor = chosenPieces[0];
    const pool = bySlot[missing];
    const ranked = anchor
      ? pool
          .map((p) => ({ p, ok: pairs(p, anchor) }))
          .sort((a, b) => Number(b.ok) - Number(a.ok))
          .map((r) => r.p)
      : pool;
    const chosen = ranked[rotation % ranked.length];
    if (chosen) assign(missing, chosen.id);
  }

  function completeFit() {
    // Fill every missing (non-locked) slot from closet.
    let anchor = chosenPieces[0];
    const next: Selection = { ...selection };
    let bumped = false;
    for (const s of SLOTS) {
      if (locked.has(s) || next[s]) continue;
      const pool = bySlot[s];
      if (!pool.length) continue;
      const sorted = anchor
        ? pool.slice().sort((a, b) => Number(pairs(b, anchor!)) - Number(pairs(a, anchor!)))
        : pool.slice();
      const pick = sorted[(rotation + s.charCodeAt(0)) % sorted.length];
      if (pick) {
        next[s] = pick.id;
        bumped = true;
        anchor = anchor ?? pick;
      }
    }
    if (!bumped) toast("Nothing to add — either locked or empty categories.");
    setSelection(next);
    setSavedId(null);
  }

  function shuffle() {
    setRotation((r) => r + 3);
    // Re-roll only unlocked slots
    const next: Selection = {};
    let anchor: ClosetItem | undefined;
    for (const s of SLOTS) {
      if (locked.has(s) && selection[s]) {
        next[s] = selection[s]!;
        anchor = anchor ?? closet.find((c) => c.id === selection[s]);
      }
    }
    for (const s of SLOTS) {
      if (locked.has(s)) continue;
      const pool = bySlot[s];
      if (!pool.length) continue;
      const sorted = anchor
        ? pool.slice().sort((a, b) => Number(pairs(b, anchor!)) - Number(pairs(a, anchor!)))
        : pool.slice();
      const pick = sorted[(rotation + s.charCodeAt(0) + 1) % sorted.length];
      if (pick) {
        next[s] = pick.id;
        anchor = anchor ?? pick;
      }
    }
    setSelection(next);
    setSavedId(null);
  }

  function addSomethingNew() {
    const missing = SLOTS.find((s) => !selection[s]);
    if (!missing) {
      toast("No missing slots to shop for.");
      return;
    }
    const scored = scoreCatalog(catalog, closet, { seed: rotation });
    const target = scored.find((g) => primary(g.item.category) === missing);
    if (!target) {
      toast("No matching recommendation found.");
      return;
    }
    setRecommend({ slot: missing, item: target.item });
    setAddNewMode(true);
  }

  function clearRecommendation() {
    setRecommend(null);
    setAddNewMode(false);
  }

  async function save() {
    if (!uid) return;
    if (chosenPieces.length < 2) {
      toast.error("Pick at least two owned pieces.");
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
        explanation: rationale.join(" • "),
      })
      .select("id")
      .single();
    if (error || !outfit) {
      setSaving(false);
      return toast.error(error?.message ?? "Save failed");
    }
    const rows = SLOTS.filter((s) => selected[s]).map((s) => ({
      outfit_id: outfit.id,
      closet_item_id: selected[s]!.id,
      role: s,
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

  if (loading)
    return (
      <div className="space-y-5">
        <StyleTabs />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );

  return (
    <div className="space-y-5">
      <StyleTabs />
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Build a look</p>
        <h1 className="mt-1 font-display text-4xl">Inspo Builder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick slots by hand or let DRIP suggest from what you own. Lock what you love.
        </p>
      </div>

      {closet.length === 0 ? (
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">Add closet pieces to start building.</p>
          <Link to="/closet/new" className="btn-lime mt-4 inline-flex">
            Add a piece
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SLOTS.map((s) => {
              const item = selected[s];
              const isRec = recommend?.slot === s;
              return (
                <li key={s} className="card-surface overflow-hidden">
                  <div className="aspect-square bg-surface-2 relative">
                    {item ? (
                      urls[item.id] ? (
                        <img
                          src={urls[item.id]}
                          alt={item.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                          {item.name}
                        </div>
                      )
                    ) : isRec ? (
                      recommend.item.image_url ? (
                        <img
                          src={recommend.item.image_url}
                          alt={recommend.item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">
                          {recommend.item.name}
                        </div>
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">
                        Empty
                      </div>
                    )}
                    <span className="absolute top-1 left-1 rounded-full bg-background/85 px-2 py-0.5 text-[9px] uppercase tracking-widest text-foreground/80">
                      {SLOT_LABEL[s]}
                    </span>
                    {item && (
                      <span className="absolute top-1 right-1 rounded-full bg-background/85 px-2 py-0.5 text-[9px] uppercase tracking-widest text-primary">
                        Owned
                      </span>
                    )}
                    {!item && isRec && (
                      <span className="absolute top-1 right-1 rounded-full bg-background/85 px-2 py-0.5 text-[9px] uppercase tracking-widest text-primary">
                        Rec
                      </span>
                    )}
                  </div>
                  <div className="p-2 space-y-1.5">
                    <p className="line-clamp-1 text-xs">
                      {item?.name ?? (isRec ? recommend.item.name : "—")}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setPickerSlot(s)}
                        className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-widest hover:bg-surface-2"
                      >
                        {item ? "Swap" : "Pick"}
                      </button>
                      {item && (
                        <>
                          <button
                            onClick={() => toggleLock(s)}
                            className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-widest ${
                              locked.has(s)
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:bg-surface-2"
                            }`}
                          >
                            {locked.has(s) ? (
                              <>
                                <Lock className="mr-1 inline h-2.5 w-2.5" /> Locked
                              </>
                            ) : (
                              <>
                                <Unlock className="mr-1 inline h-2.5 w-2.5" /> Lock
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => clearSlot(s)}
                            className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-widest hover:bg-surface-2"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {recommend && (
            <div className="card-surface p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-primary">
                  Recommended — not owned
                </p>
                <button
                  onClick={clearRecommendation}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Remove
                </button>
              </div>
              <p className="text-sm">
                {recommend.item.name}
                {recommend.item.brand ? ` · ${recommend.item.brand}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Fills your {SLOT_LABEL[recommend.slot].toLowerCase()} slot and works with your palette.
              </p>
              {hasValidBuyUrl(recommend.item) && (
                <a
                  href={recommend.item.buy_url!}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="btn-lime inline-flex items-center gap-1 !px-3 !py-1.5 text-[10px]"
                >
                  <ExternalLink className="h-3 w-3" /> Shop now
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={suggestOne}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-surface-2"
            >
              <Sparkles className="h-3.5 w-3.5" /> Suggest next piece
            </button>
            <button
              onClick={completeFit}
              className="btn-lime inline-flex items-center gap-1 !px-3 !py-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" /> Complete my fit
            </button>
            <button
              onClick={shuffle}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-surface-2"
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle unlocked
            </button>
            <button
              onClick={addSomethingNew}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-surface-2"
            >
              <Bookmark className="h-3.5 w-3.5" /> Add something new
            </button>
          </div>

          {rationale.length > 0 && (
            <div className="card-surface p-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Why it works</p>
              <ul className="mt-1 space-y-0.5">
                {rationale.map((r, i) => (
                  <li key={i} className="text-xs text-foreground/80">
                    · {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={saving || chosenPieces.length < 2}
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
            {addNewMode && recommend && (
              <span className="text-[11px] text-muted-foreground">
                Saved will only include your owned pieces — the recommended item stays a shopping link.
              </span>
            )}
          </div>

          {/* Picker sheet */}
          {pickerSlot && (
            <div
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              onClick={() => setPickerSlot(null)}
            >
              <div
                className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border bg-background p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-display text-lg">
                    Pick a {SLOT_LABEL[pickerSlot].toLowerCase()}
                  </p>
                  <button
                    onClick={() => setPickerSlot(null)}
                    className="text-xs uppercase tracking-widest text-muted-foreground"
                  >
                    Close
                  </button>
                </div>
                {bySlot[pickerSlot].length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {SLOT_LABEL[pickerSlot].toLowerCase()}s in your closet.{" "}
                    <Link to="/closet/new" className="text-primary underline">
                      Add one
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {bySlot[pickerSlot].map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => assign(pickerSlot, c.id)}
                          className="card-surface w-full overflow-hidden text-left"
                        >
                          <div className="aspect-square bg-surface-2">
                            {urls[c.id] ? (
                              <img
                                src={urls[c.id]}
                                alt={c.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">
                                {c.name}
                              </div>
                            )}
                          </div>
                          <p className="line-clamp-1 p-1.5 text-[11px]">{c.name}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
