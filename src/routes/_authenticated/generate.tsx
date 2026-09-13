import { OwnedImage } from "@/components/OwnedImage";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import {
  generateOutfits,
  pairScent,
  OCCASIONS,
  type ClosetItem,
  type OutfitPick,
  type Occasion,
  type Fragrance,
} from "@/lib/outfit-generator";
import { detectWeather, readCachedWeather, type Weather } from "@/lib/weather";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Save, Share2, Check, MapPin, Copy, ExternalLink } from "lucide-react";
import { StyleTabs } from "@/components/StyleTabs";

export const Route = createFileRoute("/_authenticated/generate")({
  head: () => ({
    meta: [{ title: "Generate — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: GeneratePage,
});

const VIBES = ["Streetwear", "Minimal", "Techwear", "Sporty", "Old-money", "Grunge", "Other"];
const DRESS = [
  { v: "loungewear", l: "Loungewear" },
  { v: "casual", l: "Casual" },
  { v: "smart_casual", l: "Smart" },
  { v: "business", l: "Business" },
  { v: "formal", l: "Formal" },
] as const;

type ShareState = { url: string; slug: string } | null;

function GeneratePage() {
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [scents, setScents] = useState<Fragrance[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [worn, setWorn] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [disliked, setDisliked] = useState<Set<string>>(new Set());
  const [userVibes, setUserVibes] = useState<string[]>([]);
  const [favoriteColors, setFavoriteColors] = useState<string[]>([]);
  const [savedCustomVibes, setSavedCustomVibes] = useState<string[]>([]);

  const [occasion, setOccasion] = useState<Occasion>("errands");
  const [vibe, setVibe] = useState("Streetwear");
  const [customVibe, setCustomVibe] = useState("");
  const [customVibeErr, setCustomVibeErr] = useState<string | null>(null);
  const [tempF, setTempF] = useState(60);
  const [dress, setDress] = useState<(typeof DRESS)[number]["v"]>("casual");
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [wornIds, setWornIds] = useState<Set<number>>(new Set());
  const [sharedByIdx, setSharedByIdx] = useState<Record<number, ShareState>>({});
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [errByIdx, setErrByIdx] = useState<Record<number, string>>({});
  const [savedBySig, setSavedBySig] = useState<Record<string, string>>({});

  function pickSignature(pick: OutfitPick): string {
    return [pick.top, pick.bottom, pick.outerwear, pick.shoes, pick.accessory]
      .filter(Boolean)
      .map((p) => (p as ClosetItem).id)
      .sort()
      .join("|");
  }

  const effectiveVibe = vibe === "Other" ? customVibe.trim() : vibe;

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sign in again to load your wardrobe.");
      const [
        { data: items, error: itemsError },
        { data: recentOutfits, error: wearError },
        { data: prefs, error: prefsError },
        { data: frags, error: scentsError },
        { data: fb, error: feedbackError },
        { data: previousSaved, error: savedError },
      ] = await Promise.all([
        supabase
          .from("closet_items")
          .select("id,name,category,kind,color,material,fit,season,formality,brand,image_url")
          .eq("user_id", uid)
          .eq("archived", false),
        supabase
          .from("wear_history")
          .select("outfit_id")
          .eq("user_id", uid)
          .order("worn_on", { ascending: false })
          .limit(10),
        supabase
          .from("user_preferences")
          .select("style_vibes, custom_vibes, favorite_colors")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("fragrances")
          .select("id,name,brand,family,season,projection,longevity,occasions")
          .eq("user_id", uid),
        supabase.from("outfit_feedback").select("liked, signature").eq("user_id", uid).limit(200),
        supabase
          .from("saved_outfits")
          .select("id,outfit_items(closet_item_id)")
          .eq("user_id", uid)
          .eq("is_shopping_idea", false),
      ]);
      if (itemsError || wearError || prefsError || scentsError || feedbackError || savedError)
        throw new Error("Could not load your wardrobe and preferences. Please retry.");
      setSavedBySig(
        Object.fromEntries(
          (previousSaved ?? []).map((o) => [
            (o.outfit_items ?? [])
              .map((p) => p.closet_item_id)
              .filter(Boolean)
              .sort()
              .join("|"),
            o.id,
          ]),
        ),
      );
      const list = (items ?? []).filter((i) => i.kind !== "fragrance") as ClosetItem[];
      setCloset(list);
      setScents((frags ?? []) as Fragrance[]);
      const outfitIds = (recentOutfits ?? []).map((r) => r.outfit_id).filter(Boolean) as string[];
      if (outfitIds.length) {
        const { data: oi } = await supabase
          .from("outfit_items")
          .select("closet_item_id")
          .in("outfit_id", outfitIds);
        setWorn(new Set((oi ?? []).map((r) => r.closet_item_id as string)));
      }
      setUserVibes(prefs?.style_vibes ?? []);
      setFavoriteColors(prefs?.favorite_colors ?? []);
      if (prefs?.style_vibes?.[0]) {
        const first = prefs.style_vibes[0];
        if (VIBES.includes(first)) setVibe(first);
        else {
          setVibe("Other");
          setCustomVibe(first);
        }
      }
      setSavedCustomVibes(
        Array.isArray((prefs as { custom_vibes?: string[] } | null)?.custom_vibes)
          ? ((prefs as { custom_vibes: string[] }).custom_vibes ?? [])
          : [],
      );
      const L = new Set<string>();
      const D = new Set<string>();
      for (const f of fb ?? []) {
        for (const id of (f.signature ?? "").split("|").filter(Boolean)) {
          if (f.liked) L.add(id);
          else D.add(id);
        }
      }
      setLiked(L);
      setDisliked(D);
      setUrls(await getSignedUrlsByItem(list));
      const cached = readCachedWeather();
      if (cached) {
        setWeather(cached);
        setTempF(cached.temperatureF);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load closet");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function loadWeather() {
    setWeatherLoading(true);
    setWeatherErr(null);
    try {
      const w = await detectWeather();
      setWeather(w);
      setTempF(w.temperatureF);
    } catch (e) {
      setWeatherErr(e instanceof Error ? e.message : "Couldn't get weather");
    } finally {
      setWeatherLoading(false);
    }
  }

  const outfits = useMemo(() => {
    if (!closet.length) return [];
    if (vibe === "Other" && !customVibe.trim()) return [];
    const activeVibe = effectiveVibe || "Casual";
    return generateOutfits(
      closet,
      { occasion, vibe: activeVibe, temperatureF: tempF, dressCode: dress },
      worn,
      [...userVibes, activeVibe],
      liked,
      disliked,
      5,
      rotation,
      favoriteColors,
    );
  }, [
    closet,
    occasion,
    vibe,
    customVibe,
    effectiveVibe,
    tempF,
    dress,
    worn,
    userVibes,
    liked,
    disliked,
    rotation,
    favoriteColors,
  ]);
  // Index-based button state must never transfer to a different generated outfit.
  useEffect(() => {
    setSavedIds(new Set());
    setWornIds(new Set());
    setSharedByIdx({});
    setErrByIdx({});
  }, [outfits]);

  async function persistCustomVibe(text: string) {
    if (!text) return;
    if (savedCustomVibes.includes(text)) return;
    const next = [text, ...savedCustomVibes].slice(0, 5);
    setSavedCustomVibes(next);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    await supabase
      .from("user_preferences")
      .upsert({ user_id: uid, custom_vibes: next }, { onConflict: "user_id" });
  }

  async function ensureSaved(
    pick: OutfitPick,
    idx: number,
    visibility: "private" | "public",
  ): Promise<string | null> {
    const sig = pickSignature(pick);
    const existing = savedBySig[sig];
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setErrByIdx((m) => ({ ...m, [idx]: "Not signed in" }));
      return null;
    }

    if (existing) {
      if (visibility === "public") {
        const { data: promoted, error } = await supabase
          .from("saved_outfits")
          .update({ visibility: "public" })
          .eq("id", existing)
          .eq("user_id", uid)
          .select("id, share_slug")
          .maybeSingle();
        if (error || !promoted) {
          setErrByIdx((m) => ({ ...m, [idx]: error?.message ?? "Couldn't share outfit" }));
          return null;
        }
      }
      setSavedIds((s) => new Set(s).add(idx));
      return existing;
    }

    const cover = pick.top.image_url ?? pick.bottom.image_url ?? pick.outerwear?.image_url ?? null;
    const scent = pairScent(
      pick,
      scents,
      { occasion, vibe: effectiveVibe || "Casual", temperatureF: tempF, dressCode: dress },
      effectiveVibe || vibe,
    );
    const name = `${effectiveVibe || "Fit"} · ${occasion}`;
    const { data: out, error } = await supabase
      .from("saved_outfits")
      .insert({
        user_id: uid,
        name,
        occasion,
        vibe: effectiveVibe || vibe,
        temperature_f: tempF,
        dress_code: dress,
        explanation: pick.rationale.join(" · "),
        score: pick.score,
        visibility,
        cover_image_url: cover,
        fragrance_id: scent?.scent.id ?? null,
      })
      .select("id, share_slug")
      .single();
    if (error || !out) {
      setErrByIdx((m) => ({ ...m, [idx]: error?.message ?? "Save failed" }));
      return null;
    }

    const roleRows: { role: string; item: ClosetItem }[] = [
      { role: "top", item: pick.top },
      { role: "bottom", item: pick.bottom },
    ];
    if (pick.outerwear) roleRows.push({ role: "outerwear", item: pick.outerwear });
    if (pick.shoes) roleRows.push({ role: "shoes", item: pick.shoes });
    if (pick.accessory) roleRows.push({ role: "accessory", item: pick.accessory });
    const { error: itemsErr } = await supabase
      .from("outfit_items")
      .insert(
        roleRows.map((r) => ({ outfit_id: out.id, closet_item_id: r.item.id, role: r.role })),
      );
    if (itemsErr) {
      await supabase.from("saved_outfits").delete().eq("id", out.id);
      setErrByIdx((m) => ({ ...m, [idx]: `Couldn't save pieces: ${itemsErr.message}` }));
      return null;
    }
    setSavedIds((s) => new Set(s).add(idx));
    setSavedBySig((m) => ({ ...m, [sig]: out.id }));
    return out.id;
  }

  async function onSavePrivate(pick: OutfitPick, idx: number) {
    setBusyIdx(idx);
    setErrByIdx((m) => ({ ...m, [idx]: "" }));
    const id = await ensureSaved(pick, idx, "private");
    setBusyIdx(null);
    if (id) toast.success("Saved to your outfits");
  }

  async function onShare(pick: OutfitPick, idx: number) {
    setBusyIdx(idx);
    setErrByIdx((m) => ({ ...m, [idx]: "" }));
    if (vibe === "Other" && !customVibe.trim()) {
      setCustomVibeErr("Describe your vibe first");
      setBusyIdx(null);
      return;
    }
    const id = await ensureSaved(pick, idx, "public");
    if (!id) {
      setBusyIdx(null);
      return;
    }
    const { data: o } = await supabase
      .from("saved_outfits")
      .select("share_slug")
      .eq("id", id)
      .maybeSingle();
    if (o?.share_slug) {
      const url = `${window.location.origin}/o/${o.share_slug}`;
      setSharedByIdx((m) => ({ ...m, [idx]: { url, slug: o.share_slug! } }));
      toast.success("Shared to feed");
      if (effectiveVibe && vibe === "Other") await persistCustomVibe(effectiveVibe);
    }
    setBusyIdx(null);
  }

  async function markWorn(pick: OutfitPick, idx: number) {
    setBusyIdx(idx);
    setErrByIdx((m) => ({ ...m, [idx]: "" }));
    const outfitId = await ensureSaved(pick, idx, "private");
    if (!outfitId) {
      setBusyIdx(null);
      return;
    }
    const { error } = await supabase.rpc("record_outfit_wear", { _outfit_id: outfitId });
    setBusyIdx(null);
    if (error) {
      setErrByIdx((m) => ({ ...m, [idx]: `Couldn't mark worn: ${error.message}` }));
      return;
    }
    setWornIds((s) => new Set(s).add(idx));
    // Fetch the wear row we just created so Undo can target it.
    const today = new Date().toISOString().slice(0, 10);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    let wearId: string | null = null;
    if (uid) {
      const { data: wh } = await supabase
        .from("wear_history")
        .select("id")
        .eq("user_id", uid)
        .eq("outfit_id", outfitId)
        .eq("worn_on", today)
        .maybeSingle();
      wearId = wh?.id ?? null;
    }
    toast.success("Marked as worn", {
      action: wearId
        ? {
            label: "Undo",
            onClick: async () => {
              const { error: rerr } = await supabase.rpc("remove_outfit_wear", {
                _wear_id: wearId,
              });
              if (rerr) {
                toast.error(rerr.message);
                return;
              }
              setWornIds((s) => {
                const next = new Set(s);
                next.delete(idx);
                return next;
              });
              toast.success("Wear undone");
            },
          }
        : undefined,
    });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Reading your closet…</p>;
  if (err)
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-sm text-destructive">{err}</p>
        <button onClick={() => void load()} className="btn-lime mt-4 inline-flex">
          Retry
        </button>
      </div>
    );

  const hasEnough =
    closet.filter((c) => c.category === "top").length >= 1 &&
    closet.filter((c) => c.category === "bottom").length >= 1 &&
    closet.some((c) => c.category === "shoes");

  return (
    <div className="space-y-6">
      <StyleTabs />
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Outfit generator</p>
        <h1 className="mt-1 font-display text-4xl">Get dressed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only pieces you own. Your saved vibe and favorite colors are included.{" "}
          <Link to="/profile" className="text-primary underline">
            Edit preferences
          </Link>
        </p>
      </div>

      {!hasEnough ? (
        <div className="card-surface p-6">
          <p className="text-sm text-muted-foreground">
            Add at least one top, one bottom and one pair of shoes to create a complete outfit.
          </p>
          <Link to="/closet/new" className="btn-lime mt-4 inline-flex">
            Add a piece
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="card-surface space-y-4 p-5">
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Occasion
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setOccasion(o.v)}
                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${occasion === o.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Vibe</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setVibe(v);
                      if (v !== "Other") setCustomVibeErr(null);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${vibe === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {vibe === "Other" && (
                <div className="mt-3 space-y-2">
                  <input
                    value={customVibe}
                    onChange={(e) => {
                      setCustomVibe(e.target.value);
                      if (e.target.value.trim()) setCustomVibeErr(null);
                    }}
                    placeholder="Describe your vibe — e.g. 'blokecore, muted olive'"
                    maxLength={60}
                    className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {customVibeErr && (
                    <p className="text-xs text-destructive" role="alert">
                      {customVibeErr}
                    </p>
                  )}
                  {savedCustomVibes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {savedCustomVibes.map((cv) => (
                        <button
                          key={cv}
                          onClick={() => setCustomVibe(cv)}
                          className="rounded-full border border-border/70 px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                        >
                          {cv}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  Weather
                </span>
                <button
                  onClick={() => void loadWeather()}
                  disabled={weatherLoading}
                  className="text-[10px] uppercase tracking-widest text-primary flex items-center gap-1 disabled:opacity-50"
                >
                  <MapPin className="h-3 w-3" />
                  {weatherLoading ? "Locating…" : "Use my weather"}
                </button>
              </div>
              {weather && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {weather.label} · {weather.temperatureF}°F · {weather.condition} · updated{" "}
                  {new Date(weather.updatedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {weatherErr && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {weatherErr} — using manual temperature.
                </p>
              )}
              <label className="block mt-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Manual temperature ({tempF}°F)
                </span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={tempF}
                  onChange={(e) => setTempF(Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
              </label>
            </div>

            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Dress code
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {DRESS.map((d) => (
                  <button
                    key={d.v}
                    onClick={() => setDress(d.v)}
                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${dress === d.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                if (vibe === "Other" && !customVibe.trim()) {
                  setCustomVibeErr("Describe your vibe first");
                  return;
                }
                setRotation((r) => r + 1);
                setSavedIds(new Set());
                setWornIds(new Set());
                setSharedByIdx({});
                setErrByIdx({});
              }}
              className="btn-lime w-full flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" /> {rotation === 0 ? "Generate" : "New set"}
            </button>
          </div>

          <div className="space-y-4">
            {outfits.map((o, idx) => {
              const scent = pairScent(
                o,
                scents,
                {
                  occasion,
                  vibe: effectiveVibe || "Casual",
                  temperatureF: tempF,
                  dressCode: dress,
                },
                effectiveVibe || vibe,
              );
              return (
                <OutfitCard
                  key={`${rotation}-${idx}`}
                  pick={o}
                  urls={urls}
                  scent={scent}
                  hasFragrances={scents.length > 0}
                  saved={savedIds.has(idx)}
                  worn={wornIds.has(idx)}
                  share={sharedByIdx[idx] ?? null}
                  busy={busyIdx === idx}
                  err={errByIdx[idx] || null}
                  onSavePrivate={() => onSavePrivate(o, idx)}
                  onSharePublic={() => onShare(o, idx)}
                  onWorn={() => markWorn(o, idx)}
                  onRegen={() => setRotation((r) => r + 1)}
                />
              );
            })}
            {outfits.length === 0 && (
              <div className="card-surface p-6 text-center text-sm text-muted-foreground">
                {vibe === "Other" && !customVibe.trim()
                  ? "Describe your vibe to generate outfits."
                  : "No combos matched. Try a different vibe or dress code."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OutfitCard({
  pick,
  urls,
  scent,
  hasFragrances,
  saved,
  worn,
  share,
  busy,
  err,
  onSavePrivate,
  onSharePublic,
  onWorn,
  onRegen,
}: {
  pick: OutfitPick;
  urls: Record<string, string>;
  scent: { scent: Fragrance; reason: string } | null;
  hasFragrances: boolean;
  saved: boolean;
  worn: boolean;
  share: ShareState;
  busy: boolean;
  err: string | null;
  onSavePrivate: () => void;
  onSharePublic: () => void;
  onWorn: () => void;
  onRegen: () => void;
}) {
  const pieces = [pick.top, pick.bottom, pick.outerwear, pick.shoes, pick.accessory].filter(
    Boolean,
  ) as ClosetItem[];
  const b = pick.breakdown;
  return (
    <div className="card-surface overflow-hidden">
      <div className="px-4 py-3 text-xs font-medium tracking-widest uppercase text-primary border-b border-border">
        Owned outfit · {pieces.length} pieces
      </div>
      <div
        className={`grid gap-1 bg-surface-2 ${pieces.length === 5 ? "grid-cols-3 sm:grid-cols-5" : pieces.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}
      >
        {pieces.map((p) => (
          <div key={p.id} className="aspect-square bg-surface">
            {urls[p.id] ? (
              <OwnedImage
                src={urls[p.id]}
                alt={p.name}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[9px] uppercase text-muted-foreground">
                {p.category}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">
              Overall {(pick.score * 100).toFixed(0)}
            </p>
            <p className="mt-1 line-clamp-1 text-sm font-medium">
              {pieces.map((p) => p.name).join(" + ")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] uppercase tracking-widest text-muted-foreground">
          <Metric label="Color" v={b.color} />
          <Metric label="Silh" v={b.silhouette} />
          <Metric label="Wthr" v={b.weather} />
          <Metric label="Form" v={b.formality} />
          <Metric label="Occ" v={b.occasion} />
          <Metric label="Pref" v={b.preference} />
          <Metric label="Div" v={b.diversity} />
        </div>
        <ul className="space-y-1">
          {pick.rationale.map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              · {r}
            </li>
          ))}
        </ul>
        {scent ? (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-[10px] uppercase tracking-widest text-primary">
              Scent pairing {hasFragrances ? "· from your shelf" : ""}
            </p>
            <p className="mt-1 text-sm">
              {scent.scent.name} <span className="text-muted-foreground">— {scent.reason}</span>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Suggested scent profile (you don't own one yet)
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              A fresh woody or citrus fragrance would suit this. Add fragrances in Closet →
              Fragrances.
            </p>
          </div>
        )}
        {worn && (
          <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">
            ✓ Logged as worn today. Piece counters updated.
          </div>
        )}
        {share && (
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 space-y-2">
            <p className="text-xs text-primary">✓ Live on the feed.</p>
            <div className="flex gap-2">
              <a
                href={`/o/${share.slug}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-full border border-primary/60 px-3 py-1.5 text-[11px] uppercase tracking-widest text-center flex items-center justify-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> View
              </a>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(share.url);
                  toast.success("Link copied");
                }}
                className="flex-1 rounded-full border border-primary/60 px-3 py-1.5 text-[11px] uppercase tracking-widest flex items-center justify-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copy link
              </button>
            </div>
          </div>
        )}
        {err && (
          <p className="text-xs text-destructive" role="alert">
            {err}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onSavePrivate}
            disabled={saved || busy}
            className="btn-lime !py-2 min-h-11 text-xs flex items-center justify-center gap-1 disabled:opacity-60"
          >
            {saved ? (
              <>
                <Check className="h-3 w-3" /> Saved
              </>
            ) : (
              <>
                <Save className="h-3 w-3" /> Save privately
              </>
            )}
          </button>
          <button
            onClick={onSharePublic}
            disabled={busy || !!share}
            className="rounded-full border border-border min-h-11 py-2 text-xs uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1 disabled:opacity-60"
          >
            <Share2 className="h-3 w-3" /> {share ? "Shared" : "Share to feed"}
          </button>
          <button
            onClick={onWorn}
            disabled={busy || worn}
            className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2 disabled:opacity-60"
          >
            {worn ? "Worn ✓" : "Mark worn"}
          </button>
          <button
            onClick={onRegen}
            disabled={busy}
            className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1 disabled:opacity-60"
          >
            <RefreshCw className="h-3 w-3" /> More
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="text-primary text-[10px]">{(v * 100).toFixed(0)}</div>
      <div>{label}</div>
    </div>
  );
}
