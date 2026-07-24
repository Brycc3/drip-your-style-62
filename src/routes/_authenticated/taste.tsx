import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Heart, X, Bookmark, Trash2, ArrowRightLeft, Eye } from "lucide-react";
import { StyleTabs } from "@/components/StyleTabs";

export const Route = createFileRoute("/_authenticated/taste")({
  head: () => ({
    meta: [{ title: "Taste — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: TastePage,
});

type SnapPiece = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  color: string | null;
  image_url: string | null;
};
type Snapshot = {
  score?: number;
  rationale?: string[];
  top?: SnapPiece;
  bottom?: SnapPiece;
  outerwear?: SnapPiece;
  shoes?: SnapPiece;
  accessory?: SnapPiece;
};
type Feedback = {
  id: string;
  liked: boolean;
  signature: string;
  snapshot: Snapshot | null;
  outfit_id: string | null;
  created_at: string;
};

function piecesOf(s: Snapshot | null): SnapPiece[] {
  if (!s) return [];
  return [s.top, s.bottom, s.outerwear, s.shoes, s.accessory].filter(
    (p): p is SnapPiece => !!p,
  );
}

function TastePage() {
  const [tab, setTab] = useState<"likes" | "passes">("likes");
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uid, setUid] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const u = userData.user?.id ?? null;
    setUid(u);
    if (!u) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("outfit_feedback")
      .select("id, liked, signature, snapshot, outfit_id, created_at")
      .eq("user_id", u)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Feedback[];
    setRows(list);
    setLoading(false);
    // Signed URLs for snapshot images
    const pieces = list.flatMap((r) => piecesOf(r.snapshot));
    const paths = Array.from(
      new Set(pieces.map((p) => p.image_url).filter((p): p is string => !!p)),
    );
    if (paths.length) {
      const entries = await Promise.all(
        paths.map(async (p) => {
          const { data: sig } = await supabase.storage
            .from("closet")
            .createSignedUrl(p, 60 * 60);
          return [p, sig?.signedUrl ?? ""] as const;
        }),
      );
      setUrls(Object.fromEntries(entries.filter(([, u]) => u)));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () => rows.filter((r) => (tab === "likes" ? r.liked : !r.liked)),
    [rows, tab],
  );
  const likesCount = rows.filter((r) => r.liked).length;
  const passesCount = rows.length - likesCount;

  async function move(fb: Feedback) {
    const { error } = await supabase
      .from("outfit_feedback")
      .update({ liked: !fb.liked })
      .eq("id", fb.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.map((r) => (r.id === fb.id ? { ...r, liked: !r.liked } : r)));
    toast.success(fb.liked ? "Moved to Passes" : "Moved to Likes");
  }

  async function del(fb: Feedback) {
    if (!confirm("Delete this feedback?")) return;
    const { error } = await supabase.from("outfit_feedback").delete().eq("id", fb.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== fb.id));
    toast.success("Removed");
  }

  async function saveToSaved(fb: Feedback) {
    if (!uid) return;
    const s = fb.snapshot;
    const pieces = piecesOf(s);
    if (pieces.length < 2) {
      toast.error("This swipe doesn't have enough pieces to save.");
      return;
    }
    // Verify pieces still exist and are unarchived for this user
    const { data: owned } = await supabase
      .from("closet_items")
      .select("id")
      .eq("user_id", uid)
      .eq("archived", false)
      .in(
        "id",
        pieces.map((p) => p.id),
      );
    const ownedIds = new Set((owned ?? []).map((o) => o.id));
    const usable = pieces.filter((p) => ownedIds.has(p.id));
    if (usable.length < 2) {
      toast.error("Some pieces are no longer in your closet.");
      return;
    }
    const name = `Liked · ${new Date(fb.created_at).toISOString().slice(0, 10)}`;
    const { data: outfit, error: oe } = await supabase
      .from("saved_outfits")
      .insert({
        user_id: uid,
        name,
        vibe: "Swipe",
        score: s?.score ?? null,
        explanation: (s?.rationale ?? []).join(" • "),
        visibility: "private",
      })
      .select("id")
      .single();
    if (oe || !outfit) {
      return toast.error(oe?.message ?? "Could not save");
    }
    const roleFor = (p: SnapPiece): string => {
      const c = p.category.toLowerCase();
      if (["top", "tee", "hoodie", "shirt", "polo"].includes(c)) return "top";
      if (["bottom", "trousers", "cargos", "joggers", "shorts", "denim", "pants"].includes(c))
        return "bottom";
      if (["outerwear", "bomber", "chore", "jacket", "coat"].includes(c)) return "outerwear";
      if (
        [
          "shoes",
          "sneaker",
          "jordan",
          "vomero",
          "new_balance",
          "loafer",
          "boot",
          "runner",
        ].includes(c)
      )
        return "shoes";
      return "accessory";
    };
    const { error: ie } = await supabase.from("outfit_items").insert(
      usable.map((p) => ({
        outfit_id: outfit.id,
        closet_item_id: p.id,
        role: roleFor(p),
      })),
    );
    if (ie) {
      await supabase.from("saved_outfits").delete().eq("id", outfit.id);
      return toast.error(`Could not save pieces: ${ie.message}`);
    }
    await supabase
      .from("outfit_feedback")
      .update({ outfit_id: outfit.id })
      .eq("id", fb.id);
    setRows((rs) =>
      rs.map((r) => (r.id === fb.id ? { ...r, outfit_id: outfit.id } : r)),
    );
    toast.success("Saved to Saved Outfits");
  }

  return (
    <div className="space-y-5">
      <StyleTabs />
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Your feedback</p>
        <h1 className="mt-1 font-display text-4xl">Taste</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every swipe is here. Move a Pass to Likes, save a favorite, or delete a mistake.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("likes")}
          className={`inline-flex items-center gap-1 rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest ${
            tab === "likes"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground/80"
          }`}
        >
          <Heart className="h-3 w-3" /> Likes ({likesCount})
        </button>
        <button
          onClick={() => setTab("passes")}
          className={`inline-flex items-center gap-1 rounded-full border px-4 py-1.5 text-xs uppercase tracking-widest ${
            tab === "passes"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground/80"
          }`}
        >
          <X className="h-3 w-3" /> Passes ({passesCount})
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          Nothing here yet.{" "}
          <Link to="/swipe" className="text-primary underline">
            Start swiping
          </Link>
          .
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((fb) => {
            const pieces = piecesOf(fb.snapshot);
            const brokenSnapshot = pieces.length === 0;
            const expanded = expandedId === fb.id;
            return (
              <li key={fb.id} className="card-surface overflow-hidden">
                {brokenSnapshot ? (
                  <div className="p-4 text-xs text-muted-foreground">
                    Older feedback — outfit details not recorded.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1 bg-surface-2">
                    {pieces.slice(0, 4).map((p) => (
                      <div key={p.id} className="aspect-square bg-surface">
                        {p.image_url && urls[p.image_url] ? (
                          <img
                            src={urls[p.image_url]}
                            alt={p.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                            {p.name}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{new Date(fb.created_at).toISOString().slice(0, 10)}</span>
                    {fb.snapshot?.score != null && (
                      <span className="text-primary">
                        Score {Math.round((fb.snapshot.score ?? 0) * 100)}
                      </span>
                    )}
                  </div>
                  {expanded && fb.snapshot?.rationale && (
                    <ul className="space-y-0.5">
                      {fb.snapshot.rationale.slice(0, 4).map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          · {r}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      onClick={() => setExpandedId(expanded ? null : fb.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-widest hover:bg-surface-2"
                    >
                      <Eye className="h-3 w-3" /> {expanded ? "Less" : "Inspect"}
                    </button>
                    <button
                      onClick={() => move(fb)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-widest hover:bg-surface-2"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      {fb.liked ? "To Passes" : "To Likes"}
                    </button>
                    {fb.liked && !brokenSnapshot && (
                      <button
                        onClick={() => saveToSaved(fb)}
                        disabled={!!fb.outfit_id}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/60 px-2.5 py-1 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        <Bookmark className="h-3 w-3" />
                        {fb.outfit_id ? "Saved" : "Save"}
                      </button>
                    )}
                    <button
                      onClick={() => del(fb)}
                      className="inline-flex items-center gap-1 rounded-full border border-destructive/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
