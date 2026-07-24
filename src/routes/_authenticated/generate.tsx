import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/closet-storage";
import {
  generateOutfits, pairScent, OCCASIONS,
  type ClosetItem, type OutfitPick, type Occasion, type Fragrance,
} from "@/lib/outfit-generator";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Save, Share2, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/generate")({
  head: () => ({
    meta: [
      { title: "Generate — DRIP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GeneratePage,
});

const VIBES = ["Streetwear", "Minimal", "Techwear", "Sporty", "Old-money", "Grunge"];
const DRESS = [
  { v: "loungewear", l: "Loungewear" },
  { v: "casual", l: "Casual" },
  { v: "smart_casual", l: "Smart" },
  { v: "business", l: "Business" },
  { v: "formal", l: "Formal" },
] as const;

function GeneratePage() {
  const navigate = useNavigate();
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [scents, setScents] = useState<Fragrance[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [worn, setWorn] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [disliked, setDisliked] = useState<Set<string>>(new Set());
  const [userVibes, setUserVibes] = useState<string[]>([]);

  const [occasion, setOccasion] = useState<Occasion>("errands");
  const [vibe, setVibe] = useState("Streetwear");
  const [tempF, setTempF] = useState(60);
  const [dress, setDress] = useState<(typeof DRESS)[number]["v"]>("casual");
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  async function load() {
    setLoading(true); setErr(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const [{ data: items }, { data: recentOutfits }, { data: prefs }, { data: frags }, { data: fb }] = await Promise.all([
        supabase.from("closet_items").select("id,name,category,kind,color,material,fit,season,formality,brand,image_url").eq("user_id", uid),
        supabase.from("wear_history").select("outfit_id").eq("user_id", uid).order("worn_on", { ascending: false }).limit(10),
        supabase.from("user_preferences").select("style_vibes").eq("user_id", uid).maybeSingle(),
        supabase.from("fragrances").select("id,name,brand,family,season,projection,longevity,occasions").eq("user_id", uid),
        supabase.from("outfit_feedback").select("liked, signature").eq("user_id", uid).limit(200),
      ]);
      const list = (items ?? []).filter((i) => i.kind !== "fragrance") as ClosetItem[];
      setCloset(list);
      setScents((frags ?? []) as Fragrance[]);
      const outfitIds = (recentOutfits ?? []).map((r) => r.outfit_id).filter(Boolean) as string[];
      if (outfitIds.length) {
        const { data: oi } = await supabase.from("outfit_items").select("closet_item_id").in("outfit_id", outfitIds);
        setWorn(new Set((oi ?? []).map((r) => r.closet_item_id as string)));
      }
      setUserVibes(prefs?.style_vibes ?? []);
      // signatures hold "|"-joined item ids
      const L = new Set<string>(); const D = new Set<string>();
      for (const f of fb ?? []) {
        for (const id of (f.signature ?? "").split("|").filter(Boolean)) {
          if (f.liked) L.add(id); else D.add(id);
        }
      }
      setLiked(L); setDisliked(D);
      setUrls(await getSignedUrls(list.map((i) => i.image_url).filter(Boolean) as string[]));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load closet");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const outfits = useMemo(() => {
    if (!closet.length) return [];
    return generateOutfits(
      closet,
      { occasion, vibe, temperatureF: tempF, dressCode: dress },
      worn, [...userVibes, vibe], liked, disliked, 5, rotation,
    );
  }, [closet, occasion, vibe, tempF, dress, worn, userVibes, liked, disliked, rotation]);

  async function saveOutfit(pick: OutfitPick, idx: number, visibility: "private" | "public"): Promise<string | null> {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { toast.error("Not signed in"); return null; }
    const cover = pick.top.image_url ?? pick.bottom.image_url ?? pick.outerwear?.image_url ?? null;
    const scent = pairScent(pick, scents, { occasion, vibe, temperatureF: tempF, dressCode: dress }, vibe);
    const { data: out, error } = await supabase.from("saved_outfits").insert({
      user_id: uid,
      name: `${vibe} · ${occasion}`,
      occasion, vibe, temperature_f: tempF, dress_code: dress,
      explanation: pick.rationale.join(" · "),
      score: pick.score, visibility, cover_image_url: cover,
      fragrance_id: scent?.scent.id ?? null,
    }).select("id, share_slug").single();
    if (error) { toast.error(error.message); return null; }

    // Build explicit role/item pairs — no zipping over a filtered array.
    const roleRows: { role: string; item: ClosetItem }[] = [
      { role: "top", item: pick.top },
      { role: "bottom", item: pick.bottom },
    ];
    if (pick.outerwear) roleRows.push({ role: "outerwear", item: pick.outerwear });
    if (pick.shoes) roleRows.push({ role: "shoes", item: pick.shoes });
    if (pick.accessory) roleRows.push({ role: "accessory", item: pick.accessory });
    await supabase.from("outfit_items").insert(
      roleRows.map((r) => ({ outfit_id: out.id, closet_item_id: r.item.id, role: r.role })),
    );
    setSavedIds((s) => new Set(s).add(idx));
    return out.id;
  }

  async function onSave(pick: OutfitPick, idx: number, visibility: "private" | "public") {
    const id = await saveOutfit(pick, idx, visibility);
    if (!id) return;
    toast.success(visibility === "public" ? "Saved & shared" : "Saved to your outfits");
    if (visibility === "public") {
      const { data: o } = await supabase.from("saved_outfits").select("share_slug").eq("id", id).maybeSingle();
      if (o?.share_slug) navigate({ to: "/o/$slug", params: { slug: o.share_slug } });
    }
  }

  async function markWorn(pick: OutfitPick, idx: number) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return toast.error("Not signed in");
    // Save privately first if not already saved
    const outfitId = await saveOutfit(pick, idx, "private");
    if (!outfitId) return;
    const pieces = [pick.top, pick.bottom, pick.outerwear, pick.shoes, pick.accessory].filter(Boolean) as ClosetItem[];
    const now = new Date().toISOString();
    await supabase.from("wear_history").insert({ user_id: uid, outfit_id: outfitId, worn_on: now });
    // Increment via read-modify-write (small MVP; single request per piece)
    await Promise.all(pieces.map(async (p) => {
      const { data: cur } = await supabase.from("closet_items").select("times_worn").eq("id", p.id).maybeSingle();
      await supabase.from("closet_items").update({
        times_worn: (cur?.times_worn ?? 0) + 1, last_worn_at: now,
      }).eq("id", p.id);
    }));
    toast.success("Marked as worn");
  }

  if (loading) return <p className="text-sm text-muted-foreground">Reading your closet…</p>;
  if (err) return (
    <div className="card-surface p-6 text-center">
      <p className="text-sm text-destructive">{err}</p>
      <button onClick={() => void load()} className="btn-lime mt-4 inline-flex">Retry</button>
    </div>
  );

  const hasEnough = closet.filter((c) => c.category === "top").length >= 1 && closet.filter((c) => c.category === "bottom").length >= 1;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Outfit generator</p>
        <h1 className="mt-1 font-display text-4xl">Get dressed</h1>
      </div>

      {!hasEnough ? (
        <div className="card-surface p-6">
          <p className="text-sm text-muted-foreground">Add at least one top and one bottom to generate outfits.</p>
        </div>
      ) : (
        <>
          <div className="card-surface space-y-4 p-5">
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Occasion</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <button key={o.v} onClick={() => setOccasion(o.v)}
                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${occasion === o.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Vibe</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <button key={v} onClick={() => setVibe(v)}
                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${vibe === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Temperature ({tempF}°F)</span>
              <input type="range" min={10} max={100} value={tempF} onChange={(e) => setTempF(Number(e.target.value))} className="mt-2 w-full accent-primary" />
            </label>
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Dress code</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {DRESS.map((d) => (
                  <button key={d.v} onClick={() => setDress(d.v)}
                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${dress === d.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}>
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => { setRotation((r) => r + 1); setSavedIds(new Set()); }} className="btn-lime w-full flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" /> {rotation === 0 ? "Generate" : "New set"}
            </button>
          </div>

          <div className="space-y-4">
            {outfits.map((o, idx) => {
              const scent = pairScent(o, scents, { occasion, vibe, temperatureF: tempF, dressCode: dress }, vibe);
              return (
                <OutfitCard key={`${rotation}-${idx}`} pick={o} urls={urls} scent={scent} saved={savedIds.has(idx)}
                  onSavePrivate={() => onSave(o, idx, "private")}
                  onSharePublic={() => onSave(o, idx, "public")}
                  onWorn={() => markWorn(o, idx)}
                  onRegen={() => setRotation((r) => r + 1)} />
              );
            })}
            {outfits.length === 0 && (
              <div className="card-surface p-6 text-center text-sm text-muted-foreground">
                No combos matched. Try a different vibe or dress code.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OutfitCard({ pick, urls, scent, saved, onSavePrivate, onSharePublic, onWorn, onRegen }: {
  pick: OutfitPick; urls: Record<string, string>;
  scent: { scent: Fragrance; reason: string } | null; saved: boolean;
  onSavePrivate: () => void; onSharePublic: () => void; onWorn: () => void; onRegen: () => void;
}) {
  const pieces = [pick.top, pick.bottom, pick.outerwear, pick.shoes, pick.accessory].filter(Boolean) as ClosetItem[];
  const b = pick.breakdown;
  return (
    <div className="card-surface overflow-hidden">
      <div className="grid grid-cols-5 gap-1 bg-surface-2">
        {pieces.map((p) => (
          <div key={p.id} className="aspect-square bg-surface">
            {urls[p.id] ? <img src={urls[p.id]} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[9px] uppercase text-muted-foreground">{p.category}</div>}
          </div>
        ))}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">Overall {(pick.score * 100).toFixed(0)}</p>
            <p className="mt-1 line-clamp-1 text-sm font-medium">{pieces.map((p) => p.name).join(" + ")}</p>
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
            <li key={i} className="text-xs text-muted-foreground">· {r}</li>
          ))}
        </ul>
        {scent && (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-[10px] uppercase tracking-widest text-primary">Scent pairing</p>
            <p className="mt-1 text-sm">{scent.scent.name} <span className="text-muted-foreground">— {scent.reason}</span></p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSavePrivate} disabled={saved} className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1 disabled:opacity-60">
            {saved ? <><Check className="h-3 w-3" /> Saved</> : <><Save className="h-3 w-3" /> Save</>}
          </button>
          <button onClick={onSharePublic} className="btn-lime !py-2 text-xs flex items-center justify-center gap-1"><Share2 className="h-3 w-3" /> Share to feed</button>
          <button onClick={onWorn} className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2">Mark worn</button>
          <button onClick={onRegen} className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1"><RefreshCw className="h-3 w-3" /> More</button>
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
