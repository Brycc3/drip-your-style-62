import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/closet-storage";
import { toast } from "sonner";
import { Heart, Bookmark, Share2 } from "lucide-react";

export const Route = createFileRoute("/o/$slug")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `Outfit — DRIP` },
      { name: "description", content: "A public outfit shared on DRIP." },
      { property: "og:title", content: "DRIP outfit" },
      { property: "og:description", content: "A public outfit shared on DRIP." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: `index,follow` },
      { name: "share-slug", content: params.slug },
    ],
  }),
  component: OutfitPage,
});

type Outfit = {
  id: string; user_id: string; name: string | null; occasion: string | null; vibe: string | null;
  explanation: string | null; cover_image_url: string | null; visibility: string; created_at: string;
};
type Piece = { id: string; name: string; category: string; brand: string | null; color: string | null; image_url: string | null };
type Comment = { id: string; user_id: string; body: string; created_at: string; parent_id: string | null };

function OutfitPage() {
  const { slug } = Route.useParams();
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [ownerHandle, setOwnerHandle] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentAuthors, setCommentAuthors] = useState<Record<string, { name: string; handle: string | null }>>({});
  const [likeCount, setLikeCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: o } = await supabase.from("saved_outfits").select("*").eq("share_slug", slug).maybeSingle();
      if (!o) { setLoading(false); return; }
      setOutfit(o as Outfit);

      const [{ data: prof }, { data: userData }, { data: oi }, { count: lc }, { data: cs }] = await Promise.all([
        supabase.from("profiles").select("handle, display_name").eq("id", o.user_id).maybeSingle(),
        supabase.auth.getUser(),
        supabase.from("outfit_items").select("closet_item_id, role").eq("outfit_id", o.id),
        supabase.from("outfit_likes").select("*", { count: "exact", head: true }).eq("outfit_id", o.id),
        supabase.from("outfit_comments").select("*").eq("outfit_id", o.id).order("created_at", { ascending: true }),
      ]);
      setOwnerHandle(prof?.handle ?? null);
      setOwnerName(prof?.display_name ?? null);
      setLikeCount(lc ?? 0);
      setComments((cs ?? []) as Comment[]);
      const uid = userData.user?.id ?? null;
      setMeId(uid);
      if (uid) {
        const [{ data: lk }, { data: sv }] = await Promise.all([
          supabase.from("outfit_likes").select("*").eq("outfit_id", o.id).eq("user_id", uid).maybeSingle(),
          supabase.from("outfit_saves").select("*").eq("outfit_id", o.id).eq("user_id", uid).maybeSingle(),
        ]);
        setLiked(Boolean(lk)); setSaved(Boolean(sv));
      }

      const itemIds = (oi ?? []).map((r) => r.closet_item_id);
      if (itemIds.length) {
        const { data: items } = await supabase.from("closet_items").select("id, name, category, brand, color, image_url").in("id", itemIds);
        const list = (items ?? []) as Piece[];
        setPieces(list);
        const pairs = await Promise.all(list.filter((p) => p.image_url).map(async (p) => [p.id, (await getSignedUrl(p.image_url!)) ?? ""] as const));
        setUrls(Object.fromEntries(pairs));
      }
      if (o.cover_image_url) setCoverUrl(await getSignedUrl(o.cover_image_url));

      const authorIds = Array.from(new Set((cs ?? []).map((c) => c.user_id)));
      if (authorIds.length) {
        const { data: ap } = await supabase.from("profiles").select("id, display_name, handle").in("id", authorIds);
        setCommentAuthors(Object.fromEntries((ap ?? []).map((p) => [p.id, { name: p.display_name ?? "someone", handle: p.handle }])));
      }
      setLoading(false);
    })();
  }, [slug]);

  async function toggleLike() {
    if (!meId || !outfit) return toast.error("Sign in to like");
    if (liked) {
      await supabase.from("outfit_likes").delete().eq("outfit_id", outfit.id).eq("user_id", meId);
      setLiked(false); setLikeCount((n) => n - 1);
    } else {
      const { error } = await supabase.from("outfit_likes").insert({ outfit_id: outfit.id, user_id: meId });
      if (error) return toast.error(error.message);
      setLiked(true); setLikeCount((n) => n + 1);
    }
  }
  async function toggleSave() {
    if (!meId || !outfit) return toast.error("Sign in to save");
    if (saved) {
      await supabase.from("outfit_saves").delete().eq("outfit_id", outfit.id).eq("user_id", meId);
      setSaved(false);
    } else {
      const { error } = await supabase.from("outfit_saves").insert({ outfit_id: outfit.id, user_id: meId });
      if (error) return toast.error(error.message);
      setSaved(true);
    }
  }
  async function share() {
    const url = `${window.location.origin}/o/${slug}`;
    try {
      if (navigator.share) await navigator.share({ url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    } catch {}
  }
  async function postComment() {
    if (!meId || !outfit) return toast.error("Sign in to comment");
    const body = draft.trim();
    if (body.length < 1) return;
    const { data, error } = await supabase.from("outfit_comments").insert({ outfit_id: outfit.id, user_id: meId, body }).select("*").single();
    if (error) return toast.error(error.message);
    setComments((c) => [...c, data as Comment]);
    setDraft("");
    if (!commentAuthors[meId]) {
      const { data: me } = await supabase.from("profiles").select("id, display_name, handle").eq("id", meId).maybeSingle();
      if (me) setCommentAuthors((a) => ({ ...a, [meId]: { name: me.display_name ?? "you", handle: me.handle } }));
    }
  }

  if (loading) return <div className="container-app py-10 text-sm text-muted-foreground">Loading…</div>;
  if (!outfit) return (
    <div className="container-app py-16 text-center">
      <Link to="/" className="font-display text-xl tracking-widest">DRIP<span className="text-primary">.</span></Link>
      <p className="mt-10 text-sm text-muted-foreground">Outfit not found or is private.</p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-6">
        <Link to="/" className="font-display text-xl tracking-widest">DRIP<span className="text-primary">.</span></Link>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface-2">
          {coverUrl ? <img src={coverUrl} alt={outfit.name ?? "outfit"} className="w-full object-cover" /> : <div className="aspect-[3/4]" />}
        </div>

        <div className="mt-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">{outfit.vibe} · {outfit.occasion}</p>
          <h1 className="mt-1 font-display text-3xl">{outfit.name ?? "Outfit"}</h1>
          {ownerHandle ? (
            <Link to="/u/$handle" params={{ handle: ownerHandle }} className="mt-1 block text-sm text-muted-foreground">by @{ownerHandle}</Link>
          ) : <p className="mt-1 text-sm text-muted-foreground">by {ownerName ?? "someone"}</p>}
          {outfit.explanation && <p className="mt-3 text-sm text-foreground/85">{outfit.explanation}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={toggleLike} className={`flex-1 flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-xs uppercase tracking-widest ${liked ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} /> {likeCount}
          </button>
          <button onClick={toggleSave} className={`flex-1 flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-xs uppercase tracking-widest ${saved ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} /> {saved ? "Saved" : "Save"}
          </button>
          <button onClick={share} className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-xs uppercase tracking-widest">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>

        {pieces.length > 0 && (
          <div className="mt-8">
            <p className="text-xs uppercase tracking-widest text-primary">Pieces</p>
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {pieces.map((p) => (
                <li key={p.id} className="card-surface overflow-hidden">
                  <div className="aspect-square bg-surface-2">
                    {urls[p.id] ? <img src={urls[p.id]} alt={p.name} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-1 text-xs">{p.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-[9px] uppercase tracking-widest text-muted-foreground">{[p.brand, p.color].filter(Boolean).join(" · ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8">
          <p className="text-xs uppercase tracking-widest text-primary">{comments.length} comment{comments.length === 1 ? "" : "s"}</p>
          <div className="mt-3 flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder={meId ? "Say something" : "Sign in to comment"}
              disabled={!meId}
              className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
            <button disabled={!meId || !draft.trim()} onClick={postComment} className="btn-lime !px-4 !py-2 text-xs disabled:opacity-50">Post</button>
          </div>
          <ul className="mt-4 space-y-3">
            {comments.map((c) => {
              const a = commentAuthors[c.user_id];
              const handle = a?.handle;
              return (
                <li key={c.id} className="card-surface p-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {handle ? <Link to="/u/$handle" params={{ handle }} className="hover:text-foreground">@{handle}</Link> : (a?.name ?? "someone")}
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">{c.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
