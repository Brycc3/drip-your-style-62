import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import { generateOutfits, type ClosetItem, type OutfitPick } from "@/lib/outfit-generator";
import { toast } from "sonner";
import { Heart, X, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/swipe")({
  head: () => ({
    meta: [{ title: "Swipe — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: SwipePage,
});

function signature(pick: OutfitPick): string {
  return [pick.top, pick.bottom, pick.outerwear, pick.shoes, pick.accessory]
    .filter(Boolean)
    .map((p) => p!.id)
    .join("|");
}

function SwipePage() {
  const navigate = useNavigate();
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [rotation, setRotation] = useState(0);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x: number; active: boolean }>({ x: 0, active: false });
  const startX = useRef(0);
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      if (!u) return;
      const { data: items } = await supabase
        .from("closet_items")
        .select("id,name,category,kind,color,material,fit,season,formality,brand,image_url")
        .eq("user_id", u);
      const list = (items ?? []).filter((i) => i.kind !== "fragrance") as ClosetItem[];
      setCloset(list);
      setUrls(await getSignedUrlsByItem(list));
      setLoading(false);
    })();
  }, []);

  const outfits = useMemo(() => {
    if (!closet.length) return [];
    return generateOutfits(
      closet,
      { occasion: "errands", vibe: "Streetwear", temperatureF: 65, dressCode: "casual" },
      new Set(),
      [],
      new Set(),
      new Set(),
      20,
      rotation,
    );
  }, [closet, rotation]);

  async function react(liked: boolean) {
    const pick = outfits[index];
    if (!pick || !uid) return;
    const sig = signature(pick);
    const { error } = await supabase
      .from("outfit_feedback")
      .insert({ user_id: uid, liked, signature: sig });
    if (error) toast.error(error.message);
    setDrag({ x: 0, active: false });
    if (index + 1 >= outfits.length) {
      toast.success(liked ? "Liked" : "Passed");
      setRotation((r) => r + 1);
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    pointerId.current = e.pointerId;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startX.current = e.clientX;
    setDrag({ x: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.active || pointerId.current !== e.pointerId) return;
    setDrag({ x: e.clientX - startX.current, active: true });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    const dx = drag.x;
    if (Math.abs(dx) > 120) {
      void react(dx > 0);
    } else {
      setDrag({ x: 0, active: false });
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!closet.length)
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">Add pieces to your closet first.</p>
        <button
          onClick={() => navigate({ to: "/closet/new" })}
          className="btn-lime mt-4 inline-flex"
        >
          Add a piece
        </button>
      </div>
    );

  const pick = outfits[index];
  const rotate = drag.x / 20;
  const opacity = 1 - Math.min(0.5, Math.abs(drag.x) / 400);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Train your taste</p>
        <h1 className="mt-1 font-display text-4xl">Swipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag right to like, left to pass — or use the buttons. Feedback tunes future outfits.
        </p>
      </div>

      {!pick ? (
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">Out of combos for now.</p>
          <button
            onClick={() => {
              setRotation((r) => r + 1);
              setIndex(0);
            }}
            className="btn-lime mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> More
          </button>
        </div>
      ) : (
        <div
          className="card-surface overflow-hidden touch-pan-y select-none"
          style={{
            transform: `translateX(${drag.x}px) rotate(${rotate}deg)`,
            opacity,
            transition: drag.active ? "none" : "transform 200ms ease, opacity 200ms ease",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="group"
          aria-label="Outfit card — drag to like or pass"
        >
          <div className="grid grid-cols-2 gap-1 bg-surface-2">
            {[pick.top, pick.bottom, pick.outerwear, pick.shoes].filter(Boolean).map((p) => (
              <div key={p!.id} className="aspect-square bg-surface">
                {urls[p!.id] ? (
                  <img
                    src={urls[p!.id]}
                    alt={p!.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-primary">
              Score {(pick.score * 100).toFixed(0)}
            </p>
            <ul className="space-y-1">
              {pick.rationale.slice(0, 3).map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  · {r}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => react(false)}
                className="rounded-full border border-border py-3 flex items-center justify-center gap-2 text-sm uppercase tracking-widest hover:bg-surface-2"
              >
                <X className="h-4 w-4" /> Pass
              </button>
              <button
                onClick={() => react(true)}
                className="btn-lime !py-3 flex items-center justify-center gap-2"
              >
                <Heart className="h-4 w-4" /> Like
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
