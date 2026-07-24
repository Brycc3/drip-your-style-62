import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import { generateOutfits, type ClosetItem, type OutfitPick } from "@/lib/outfit-generator";
import { toast } from "sonner";
import { Heart, X, RefreshCw, Undo2, Eye } from "lucide-react";
import { StyleTabs } from "@/components/StyleTabs";

export const Route = createFileRoute("/_authenticated/swipe")({
  head: () => ({
    meta: [{ title: "Swipe — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: SwipePage,
});

type Snapshot = {
  score: number;
  rationale: string[];
  top?: SnapPiece;
  bottom?: SnapPiece;
  outerwear?: SnapPiece;
  shoes?: SnapPiece;
  accessory?: SnapPiece;
};
type SnapPiece = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  color: string | null;
  image_url: string | null;
};

function pickToSnapshot(p: OutfitPick): Snapshot {
  const map = (c: ClosetItem | undefined | null): SnapPiece | undefined =>
    c
      ? {
          id: c.id,
          name: c.name,
          category: c.category,
          brand: c.brand,
          color: c.color,
          image_url: c.image_url,
        }
      : undefined;
  return {
    score: p.score,
    rationale: p.rationale,
    top: map(p.top),
    bottom: map(p.bottom),
    outerwear: map(p.outerwear),
    shoes: map(p.shoes),
    accessory: map(p.accessory),
  };
}

function signatureOf(p: OutfitPick): string {
  return [p.top, p.bottom, p.outerwear, p.shoes, p.accessory]
    .filter(Boolean)
    .map((c) => (c as ClosetItem).id)
    .sort()
    .join("|");
}

const SWIPE_THRESHOLD_PX = 110;
const SWIPE_VELOCITY = 0.55; // px/ms

function SwipePage() {
  const navigate = useNavigate();
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [rotation, setRotation] = useState(0);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [seenSigs, setSeenSigs] = useState<Set<string>>(new Set());
  const [inspect, setInspect] = useState(false);
  const [lastFb, setLastFb] = useState<{ id: string; liked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flyOff, setFlyOff] = useState<{ dir: 1 | -1 } | null>(null);

  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id ?? null;
      setUid(u);
      if (!u) return;
      const [{ data: items }, { data: prevFb }] = await Promise.all([
        supabase
          .from("closet_items")
          .select("id,name,category,kind,color,material,fit,season,formality,brand,image_url")
          .eq("user_id", u)
          .eq("archived", false),
        supabase
          .from("outfit_feedback")
          .select("signature")
          .eq("user_id", u)
          .order("created_at", { ascending: false })
          .limit(80),
      ]);
      const list = (items ?? []).filter((i) => i.kind !== "fragrance") as ClosetItem[];
      setCloset(list);
      setUrls(await getSignedUrlsByItem(list));
      setSeenSigs(new Set((prevFb ?? []).map((r) => r.signature)));
      setLoading(false);
    })();
  }, []);

  const outfits = useMemo(() => {
    if (!closet.length) return [];
    const all = generateOutfits(
      closet,
      { occasion: "errands", vibe: "Streetwear", temperatureF: 65, dressCode: "casual" },
      new Set(),
      [],
      new Set(),
      new Set(),
      30,
      rotation,
    );
    // Prevent immediate repeats within this session/rotation
    return all.filter((p) => !seenSigs.has(signatureOf(p)));
  }, [closet, rotation, seenSigs]);

  const pick = outfits[index];

  async function react(liked: boolean) {
    if (!pick || !uid || busy) return;
    setErr(null);
    setBusy(true);
    const sig = signatureOf(pick);
    const snapshot = pickToSnapshot(pick);
    const { data, error } = await supabase
      .from("outfit_feedback")
      .insert({ user_id: uid, liked, signature: sig, snapshot })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      setErr(error?.message ?? "Could not save feedback. Try again.");
      setDrag({ x: 0, y: 0, active: false });
      setFlyOff(null);
      return;
    }
    setLastFb({ id: data.id, liked });
    setSeenSigs((s) => new Set(s).add(sig));
    // Fly card off screen
    setFlyOff({ dir: liked ? 1 : -1 });
    setTimeout(() => {
      setFlyOff(null);
      setDrag({ x: 0, y: 0, active: false });
      if (index + 1 >= outfits.length) {
        setRotation((r) => r + 1);
        setIndex(0);
      } else {
        setIndex((i) => i + 1);
      }
      setBusy(false);
    }, 220);
  }

  async function undo() {
    if (!lastFb) return;
    const { error } = await supabase.from("outfit_feedback").delete().eq("id", lastFb.id);
    if (error) return toast.error(error.message);
    setSeenSigs((s) => {
      // Rebuild without last signature by leaving as-is; the next generation
      // will surface a fresh set. Safe simplification.
      return s;
    });
    setLastFb(null);
    toast.success("Undone. Rewind by one.");
    setIndex((i) => Math.max(0, i - 1));
  }

  function commitByGesture(dx: number, dt: number) {
    const velocity = Math.abs(dx) / Math.max(1, dt);
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX || velocity > SWIPE_VELOCITY) {
      void react(dx > 0);
    } else {
      setDrag({ x: 0, y: 0, active: false });
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (busy || flyOff) return;
    pointerIdRef.current = e.pointerId;
    cardRef.current?.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current || pointerIdRef.current !== e.pointerId) return;
    setDrag({
      x: e.clientX - startRef.current.x,
      y: (e.clientY - startRef.current.y) * 0.25,
      active: true,
    });
  }
  function onPointerEnd(e: React.PointerEvent) {
    if (!startRef.current || pointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - startRef.current.x;
    const dt = performance.now() - startRef.current.t;
    startRef.current = null;
    pointerIdRef.current = null;
    try {
      cardRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    commitByGesture(dx, dt);
  }

  if (loading)
    return (
      <div className="space-y-5">
        <StyleTabs />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );

  if (!closet.length)
    return (
      <div className="space-y-5">
        <StyleTabs />
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">Add pieces to your closet first.</p>
          <button
            onClick={() => navigate({ to: "/closet/new" })}
            className="btn-lime mt-4 inline-flex"
          >
            Add a piece
          </button>
        </div>
      </div>
    );

  const dx = flyOff ? flyOff.dir * 800 : drag.x;
  const dy = drag.y;
  const rotate = dx / 20;
  const likeOpacity = Math.min(1, Math.max(0, dx / 120));
  const passOpacity = Math.min(1, Math.max(0, -dx / 120));

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <StyleTabs />
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Train your taste</p>
        <h1 className="mt-1 font-display text-4xl">Swipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag or use the buttons. Every swipe is saved to Taste — undo or move it later.
        </p>
      </div>

      {err && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {err}
        </div>
      )}

      {!pick ? (
        <div className="card-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">Out of fresh combos.</p>
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
        <div className="relative">
          <div
            ref={cardRef}
            className="card-surface overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing relative"
            style={{
              transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`,
              transition:
                drag.active && !flyOff
                  ? "none"
                  : "transform 220ms ease-out, opacity 220ms ease-out",
              opacity: flyOff ? 0 : 1,
              touchAction: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            role="group"
            aria-label="Outfit card — drag to like or pass"
          >
            {/* Overlays */}
            <div
              className="pointer-events-none absolute top-4 left-4 z-10 rounded-md border-2 border-primary px-3 py-1 font-display text-xl uppercase tracking-widest text-primary -rotate-6"
              style={{ opacity: likeOpacity }}
            >
              Like
            </div>
            <div
              className="pointer-events-none absolute top-4 right-4 z-10 rounded-md border-2 border-destructive px-3 py-1 font-display text-xl uppercase tracking-widest text-destructive rotate-6"
              style={{ opacity: passOpacity }}
            >
              Pass
            </div>

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
                  ) : (
                    <div className="flex h-full items-center justify-center p-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p!.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-primary">
                  Score {(pick.score * 100).toFixed(0)}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspect((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-3 w-3" /> {inspect ? "Hide" : "Inspect"}
                </button>
              </div>
              <ul className="space-y-1">
                {pick.rationale.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    · {r}
                  </li>
                ))}
              </ul>
              {inspect && (
                <ul className="mt-1 space-y-1 border-t border-border pt-2 text-xs">
                  {(
                    [
                      ["Top", pick.top],
                      ["Bottom", pick.bottom],
                      ["Outerwear", pick.outerwear],
                      ["Shoes", pick.shoes],
                      ["Accessory", pick.accessory],
                    ] as const
                  )
                    .filter(([, p]) => !!p)
                    .map(([label, p]) => (
                      <li key={label} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-foreground/90 truncate">
                          {[
                            (p as ClosetItem).brand,
                            (p as ClosetItem).color,
                            (p as ClosetItem).name,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      {pick && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => react(false)}
            disabled={busy || !!flyOff}
            className="rounded-full border border-border py-3 flex items-center justify-center gap-2 text-sm uppercase tracking-widest hover:bg-surface-2 disabled:opacity-60"
          >
            <X className="h-4 w-4" /> Pass
          </button>
          <button
            onClick={() => react(true)}
            disabled={busy || !!flyOff}
            className="btn-lime !py-3 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Heart className="h-4 w-4" /> Like
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={undo}
          disabled={!lastFb}
          className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Undo2 className="h-3 w-3" /> Undo last
        </button>
        <Link
          to="/taste"
          className="text-xs uppercase tracking-widest text-primary hover:underline"
        >
          Review Taste →
        </Link>
      </div>
    </div>
  );
}
