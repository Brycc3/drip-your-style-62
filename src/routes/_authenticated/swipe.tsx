import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/closet-storage";
import { generateOutfits, type ClosetItem, type OutfitPick } from "@/lib/outfit-generator";
import { toast } from "sonner";
import { Heart, X, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/swipe")({
  head: () => ({
    meta: [
      { title: "Swipe — DRIP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SwipePage,
});

function signature(pick: OutfitPick): string {
  return [pick.top, pick.bottom, pick.outerwear, pick.shoes, pick.accessory]
    .filter(Boolean).map((p) => p!.id).join("|");
}

function SwipePage() {
  const navigate = useNavigate();
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [rotation, setRotation] = useState(0);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      if (!u) return;
      const { data: items } = await supabase.from("closet_items").select("id,name,category,kind,color,material,fit,season,formality,brand,image_url").eq("user_id", u);
      const list = (items ?? []).filter((i) => i.kind !== "fragrance") as ClosetItem[];
      setCloset(list);
      setUrls(await getSignedUrls(list.map((i) => i.image_url).filter(Boolean) as string[]));
      setLoading(false);
    })();
  }, []);

  const outfits = useMemo(() => {
    if (!closet.length) return [];
    return generateOutfits(
      closet, { occasion: "errands", vibe: "Streetwear", temperatureF: 65, dressCode: "casual" },
      new Set(), [], new Set(), new Set(), 20, rotation,
    );
  }, [closet, rotation]);

  async function react(liked: boolean) {
    const pick = outfits[index];
    if (!pick || !uid) return;
    const sig = signature(pick);
    await supabase.from("outfit_feedback").insert({ user_id: uid, liked, signature: sig });
    setIndex((i) => i + 1);
    if (index + 1 >= outfits.length) {
      toast.success(liked ? "Liked" : "Passed");
      setRotation((r) => r + 1);
      setIndex(0);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!closet.length) return (
    <div className="card-surface p-6 text-center">
      <p className="text-sm text-muted-foreground">Add pieces to your closet first.</p>
      <button onClick={() => navigate({ to: "/closet/new" })} className="btn-lime mt-4 inline-flex">Add a piece</button>
    </div>
  );

  const pick = outfits[index];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Train your taste</p>
        <h1 className="mt-1 font-display text-4xl">Swipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">Right if you'd wear it. Left to pass. Feedback tunes future outfits.</p>
      </div>

      {!pick ? (
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">Out of combos for now.</p>
          <button onClick={() => { setRotation((r) => r + 1); setIndex(0); }} className="btn-lime mt-4 inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" /> More</button>
        </div>
      ) : (
        <div className="card-surface overflow-hidden">
          <div className="grid grid-cols-2 gap-1 bg-surface-2">
            {[pick.top, pick.bottom, pick.outerwear, pick.shoes].filter(Boolean).map((p) => (
              <div key={p!.id} className="aspect-square bg-surface">
                {urls[p!.id] ? <img src={urls[p!.id]} alt={p!.name} className="h-full w-full object-cover" /> : null}
              </div>
            ))}
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-primary">Score {(pick.score * 100).toFixed(0)}</p>
            <ul className="space-y-1">
              {pick.rationale.slice(0, 3).map((r, i) => <li key={i} className="text-xs text-muted-foreground">· {r}</li>)}
            </ul>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => react(false)} className="rounded-full border border-border py-3 flex items-center justify-center gap-2 text-sm uppercase tracking-widest hover:bg-surface-2">
                <X className="h-4 w-4" /> Pass
              </button>
              <button onClick={() => react(true)} className="btn-lime !py-3 flex items-center justify-center gap-2">
                <Heart className="h-4 w-4" /> Like
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
