import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl, uploadClosetImage } from "@/lib/closet-storage";
import { generateOutfits, type ClosetItem, type OutfitPick } from "@/lib/outfit-generator";
import { toast } from "sonner";
import { Sparkles, RefreshCw, Save, Share2 } from "lucide-react";

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
  { v: "smart_casual", l: "Smart casual" },
  { v: "business", l: "Business" },
  { v: "formal", l: "Formal" },
] as const;

function GeneratePage() {
  const navigate = useNavigate();
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [worn, setWorn] = useState<Set<string>>(new Set());
  const [userVibes, setUserVibes] = useState<string[]>([]);

  const [occasion, setOccasion] = useState("Coffee run");
  const [vibe, setVibe] = useState("Streetwear");
  const [tempF, setTempF] = useState(60);
  const [dress, setDress] = useState<(typeof DRESS)[number]["v"]>("casual");
  const [regen, setRegen] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const [{ data: items }, { data: recentOutfits }, { data: prefs }] = await Promise.all([
        supabase.from("closet_items").select("id,name,category,kind,color,material,fit,season,formality,brand,image_url").eq("user_id", uid),
        supabase.from("wear_history").select("outfit_id").eq("user_id", uid).order("worn_on", { ascending: false }).limit(10),
        supabase.from("user_preferences").select("style_vibes").eq("user_id", uid).maybeSingle(),
      ]);
      const list = (items ?? []) as ClosetItem[];
      setCloset(list);
      const outfitIds = (recentOutfits ?? []).map((r) => r.outfit_id).filter(Boolean) as string[];
      if (outfitIds.length) {
        const { data: oi } = await supabase.from("outfit_items").select("closet_item_id").in("outfit_id", outfitIds);
        setWorn(new Set((oi ?? []).map((r) => r.closet_item_id as string)));
      }
      setUserVibes(prefs?.style_vibes ?? []);
      const entries = await Promise.all(
        list.filter((i) => i.image_url).map(async (i) => [i.id, (await getSignedUrl(i.image_url!)) ?? ""] as const),
      );
      setUrls(Object.fromEntries(entries));
      setLoading(false);
    })();
  }, []);

  const outfits = useMemo(() => {
    if (!closet.length) return [];
    return generateOutfits(closet, { occasion, vibe, temperatureF: tempF, dressCode: dress }, worn, [...userVibes, vibe], 5);
    // regen just changes the memo key by mixing seed into vibes — no true random, we intentionally deterministic
  }, [closet, occasion, vibe, tempF, dress, worn, userVibes, regen]);

  async function saveOutfit(pick: OutfitPick, visibility: "private" | "public") {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      // Use the top's image as the cover (signed → we upload a persistent copy is out of scope; use signed url which expires — for now store the storage path so /o page can sign it, but we want a stable public URL for feed). Simplest MVP: use the top's image_url path stored in closet_items (already the storage path); on public feed we'll re-sign it. Store the path in cover_image_url.
      const cover = pick.top.image_url ?? pick.bottom.image_url ?? pick.outerwear?.image_url ?? null;

      const { data: out, error } = await supabase.from("saved_outfits").insert({
        user_id: uid,
        name: `${vibe} · ${occasion}`,
        occasion, vibe, temperature_f: tempF, dress_code: dress,
        explanation: pick.rationale.join(" · "),
        score: pick.score,
        visibility,
        cover_image_url: cover,
      }).select("id, share_slug").single();
      if (error) throw error;

      const pieces = [pick.top, pick.bottom, pick.outerwear, pick.shoes, pick.accessory].filter(Boolean) as ClosetItem[];
      const roles = ["top","bottom","outerwear","shoes","accessory"];
      const rows = pieces.map((p, i) => ({ outfit_id: out.id, closet_item_id: p.id, role: roles[i] }));
      await supabase.from("outfit_items").insert(rows);

      toast.success(visibility === "public" ? "Saved & shared to feed" : "Saved to your outfits");
      navigate({ to: "/o/$slug", params: { slug: out.share_slug! } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function markWorn(_pick: OutfitPick) {
    toast.success("Save the outfit first to track wears");
  }

  if (loading) return <p className="text-sm text-muted-foreground">Reading your closet…</p>;

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
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Where are you going</span>
              <input value={occasion} onChange={(e) => setOccasion(e.target.value)} maxLength={60}
                className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary" />
            </label>
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
            <button onClick={() => setRegen((r) => r + 1)} className="btn-lime w-full flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4" /> Generate
            </button>
          </div>

          <div className="space-y-4">
            {outfits.map((o, idx) => (
              <OutfitCard key={idx} pick={o} urls={urls}
                onSavePrivate={() => saveOutfit(o, "private")}
                onSharePublic={() => saveOutfit(o, "public")}
                onWorn={() => markWorn(o)}
                onRegen={() => setRegen((r) => r + 1)}
              />
            ))}
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

function OutfitCard({ pick, urls, onSavePrivate, onSharePublic, onWorn, onRegen }: {
  pick: OutfitPick; urls: Record<string, string>;
  onSavePrivate: () => void; onSharePublic: () => void; onWorn: () => void; onRegen: () => void;
}) {
  const pieces = [pick.top, pick.bottom, pick.outerwear, pick.shoes].filter(Boolean) as ClosetItem[];
  return (
    <div className="card-surface overflow-hidden">
      <div className="grid grid-cols-4 gap-1 bg-surface-2">
        {pieces.map((p) => (
          <div key={p.id} className="aspect-square bg-surface">
            {urls[p.id] ? <img src={urls[p.id]} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[9px] uppercase text-muted-foreground">{p.category}</div>}
          </div>
        ))}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">Score {(pick.score * 100).toFixed(0)}</p>
            <p className="mt-1 line-clamp-1 text-sm font-medium">{pieces.map((p) => p.name).join(" + ")}</p>
          </div>
        </div>
        <ul className="space-y-1">
          {pick.rationale.map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground">· {r}</li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSavePrivate} className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1"><Save className="h-3 w-3" /> Save</button>
          <button onClick={onSharePublic} className="btn-lime !py-2 text-xs flex items-center justify-center gap-1"><Share2 className="h-3 w-3" /> Share to feed</button>
          <button onClick={onWorn} className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2">Mark worn</button>
          <button onClick={onRegen} className="rounded-full border border-border py-2 text-xs uppercase tracking-widest hover:bg-surface-2 flex items-center justify-center gap-1"><RefreshCw className="h-3 w-3" /> More</button>
        </div>
      </div>
    </div>
  );
}
