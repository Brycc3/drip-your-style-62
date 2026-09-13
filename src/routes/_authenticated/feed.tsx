import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPublicOutfitCovers } from "@/lib/public-outfit.functions";
import { getBlockedUserIds, excludeBlocked } from "@/lib/blocks";
import { Flame, Clock, Trophy, MessageCircle, Heart, Flag, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Feed — DRIP" },
      { name: "description", content: "Trending outfits from the DRIP community." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeedPage,
});

type Row = {
  id: string;
  user_id: string;
  name: string | null;
  cover_image_url: string | null;
  occasion: string | null;
  vibe: string | null;
  share_slug: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  trending_score: number;
};

type Tab = "trending" | "top" | "new";

function FeedPage() {
  const [tab, setTab] = useState<Tab>("trending");
  const [rows, setRows] = useState<Row[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [handles, setHandles] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const col =
        tab === "trending" ? "trending_score" : tab === "top" ? "like_count" : "created_at";
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const [{ data, error: qErr }, blocked] = await Promise.all([
        supabase.from("outfit_leaderboard").select("*").order(col, { ascending: false }).limit(60),
        getBlockedUserIds(uid),
      ]);
      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }
      const list = excludeBlocked((data ?? []) as Row[], blocked).slice(0, 30);
      setRows(list);
      setLoading(false);

      if (list.length === 0) return;
      const [coversBySlug, profs] = await Promise.all([
        getPublicOutfitCovers({
          data: { slugs: list.map((r) => r.share_slug ?? "").filter(Boolean) },
        }).catch(() => ({}) as Record<string, string>),
        supabase
          .from("profiles")
          .select("id, handle")
          .in(
            "id",
            list.map((r) => r.user_id),
          ),
      ]);
      const byId: Record<string, string> = {};
      for (const r of list)
        if (r.share_slug && coversBySlug[r.share_slug]) byId[r.id] = coversBySlug[r.share_slug];
      setUrls(byId);
      setHandles(Object.fromEntries((profs.data ?? []).map((p) => [p.id, p.handle])));
    })().catch(() => {
      setError("The feed could not load safely. Check your connection and retry.");
      setLoading(false);
    });
  }, [tab]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Community</p>
        <h1 className="mt-1 font-display text-4xl">Feed</h1>
      </div>
      <div className="flex gap-2">
        <TabBtn
          active={tab === "trending"}
          onClick={() => setTab("trending")}
          icon={<Flame className="h-3.5 w-3.5" />}
        >
          Trending
        </TabBtn>
        <TabBtn
          active={tab === "top"}
          onClick={() => setTab("top")}
          icon={<Trophy className="h-3.5 w-3.5" />}
        >
          Top
        </TabBtn>
        <TabBtn
          active={tab === "new"}
          onClick={() => setTab("new")}
          icon={<Clock className="h-3.5 w-3.5" />}
        >
          New
        </TabBtn>
      </div>

      {error ? (
        <div role="alert" className="card-surface p-6 text-center text-sm text-destructive">
          Couldn't load the feed. {error}
          <button className="btn-lime mt-3" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          Nothing public yet. Be first — publish an outfit from{" "}
          <Link to="/saved" className="text-primary underline">
            Saved
          </Link>
          .
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to="/o/$slug"
                params={{ slug: r.share_slug ?? "" }}
                className="card-surface block overflow-hidden"
              >
                <div className="aspect-[3/4] bg-surface-2">
                  {urls[r.id] ? (
                    <img
                      src={urls[r.id]}
                      alt={r.name ?? ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-medium">{r.name ?? "Outfit"}</p>
                  <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>@{handles[r.user_id] ?? "anon"}</span>
                    <span className="flex items-center gap-2">
                      <span className="flex items-center gap-0.5">
                        <Heart className="h-3 w-3" /> {r.like_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageCircle className="h-3 w-3" /> {r.comment_count}
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-surface-2 p-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Link
          to="/legal/community-guidelines"
          className="flex items-center gap-1 hover:text-foreground"
        >
          <ShieldCheck className="h-3 w-3" /> Community Guidelines
        </Link>
        <Link to="/legal/acceptable-use" className="flex items-center gap-1 hover:text-foreground">
          <Flag className="h-3 w-3" /> Report content
        </Link>
      </div>
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest ${active ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80"}`}
    >
      {icon}
      {children}
    </button>
  );
}
