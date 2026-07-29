import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getSignedUrl } from "@/lib/closet-storage";
import { blockAndUnfollow, unblockUser } from "@/lib/moderation.functions";
import { ReportDialog } from "@/components/ReportDialog";
import { toast } from "sonner";
import { Flag, Ban } from "lucide-react";


export const Route = createFileRoute("/u/$handle")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} — DRIP` },
      {
        name: "description",
        content: `Public wardrobe and outfits from @${params.handle} on DRIP.`,
      },
      { property: "og:title", content: `@${params.handle} on DRIP` },
      { property: "og:description", content: "Public wardrobe and outfits." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => <ErrorView msg={error.message} />,
  notFoundComponent: () => <ErrorView msg="No such handle." />,
  component: PublicProfile,
});

type Outfit = {
  id: string;
  name: string | null;
  cover_image_url: string | null;
  share_slug: string | null;
  created_at: string;
};

function PublicProfile() {
  const { handle } = Route.useParams();
  const blockFn = useServerFn(blockAndUnfollow);
  const unblockFn = useServerFn(unblockUser);
  const [profile, setProfile] = useState<{
    id: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [followers, setFollowers] = useState(0);
  const [meId, setMeId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notExists, setNotExists] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, bio, avatar_url, is_public, public_suspended")
        .eq("handle", handle)
        .maybeSingle();
      if (!p || !p.is_public || p.public_suspended) {
        setNotExists(true);
        setLoading(false);
        return;
      }
      setProfile(p);


      const [{ data: outs }, { count }, { data: userData }] = await Promise.all([
        supabase
          .from("saved_outfits")
          .select("id, name, cover_image_url, share_slug, created_at")
          .eq("user_id", p.id)
          .eq("visibility", "public")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("followee_id", p.id),
        supabase.auth.getUser(),
      ]);
      setOutfits(outs ?? []);
      setFollowers(count ?? 0);
      const uid = userData.user?.id ?? null;
      setMeId(uid);
      if (uid && uid !== p.id) {
        const [{ data: f }, { data: b }] = await Promise.all([
          supabase
            .from("follows")
            .select("follower_id")
            .eq("follower_id", uid)
            .eq("followee_id", p.id)
            .maybeSingle(),
          supabase
            .from("user_blocks")
            .select("blocker_id")
            .eq("blocker_id", uid)
            .eq("blocked_id", p.id)
            .maybeSingle(),
        ]);
        setIsFollowing(Boolean(f));
        setBlockedByMe(Boolean(b));
      }


      const list = outs ?? [];
      const entries = await Promise.all(
        list
          .filter((o) => o.cover_image_url)
          .map(async (o) => [o.id, (await getSignedUrl(o.cover_image_url!)) ?? ""] as const),
      );
      setUrls(Object.fromEntries(entries));
      setLoading(false);
    })();
  }, [handle]);

  async function toggleFollow() {
    if (!meId || !profile) {
      toast.error("Sign in to follow");
      return;
    }
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", meId).eq("followee_id", profile.id);
      setIsFollowing(false);
      setFollowers((n) => n - 1);
    } else {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: meId, followee_id: profile.id });
      if (error) return toast.error(error.message);
      setIsFollowing(true);
      setFollowers((n) => n + 1);
    }
  }

  if (loading)
    return <div className="container-app py-10 text-sm text-muted-foreground">Loading…</div>;
  if (notExists || !profile) return <ErrorView msg="This profile is private or doesn't exist." />;

  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-8">
        <Link to="/" className="font-display text-xl tracking-widest">
          DRIP<span className="text-primary">.</span>
        </Link>
        <div className="mt-8 flex items-start gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-surface">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">@{handle}</p>
            <h1 className="mt-1 font-display text-3xl">{profile.display_name ?? handle}</h1>
            {profile.bio && <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p>}
            <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
              {meId ? `${followers} follower${followers === 1 ? "" : "s"} · ` : ""}
              {outfits.length} outfits
            </p>
          </div>
        </div>
        {meId && meId !== profile.id && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={toggleFollow}
              disabled={blockedByMe}
              className={`flex-1 rounded-full py-3 text-xs uppercase tracking-widest disabled:opacity-40 ${isFollowing ? "border border-border" : "btn-lime"}`}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
            <button
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 text-xs uppercase tracking-widest hover:bg-surface-2"
            >
              <Flag className="h-3.5 w-3.5" /> Report
            </button>
            <button
              onClick={async () => {
                if (blockedByMe) {
                  try {
                    await unblockFn({ data: { blocked_id: profile.id } });
                    setBlockedByMe(false);
                    toast.success("Unblocked");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                } else {
                  if (!confirm("Block this user? They won't see your content and you won't see theirs.")) return;
                  try {
                    await blockFn({ data: { blocked_id: profile.id } });
                    setBlockedByMe(true);
                    setIsFollowing(false);
                    toast.success("Blocked");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 text-xs uppercase tracking-widest ${blockedByMe ? "border-primary text-primary" : "border-destructive/50 text-destructive hover:bg-destructive/10"}`}
            >
              <Ban className="h-3.5 w-3.5" /> {blockedByMe ? "Unblock" : "Block"}
            </button>
          </div>
        )}


        <ul className="mt-8 grid grid-cols-2 gap-3">
          {outfits.map((o) => (
            <li key={o.id}>
              <Link
                to="/o/$slug"
                params={{ slug: o.share_slug ?? "" }}
                className="card-surface block overflow-hidden"
              >
                <div className="aspect-[3/4] bg-surface-2">
                  {urls[o.id] ? (
                    <img
                      src={urls[o.id]}
                      alt={o.name ?? ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 text-sm">{o.name ?? "Outfit"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {outfits.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">No public outfits yet.</p>
        )}
      </div>
      <ReportDialog
        targetType="user"
        targetId={profile.id}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}


function ErrorView({ msg }: { msg: string }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-16 text-center">
        <Link to="/" className="font-display text-xl tracking-widest">
          DRIP<span className="text-primary">.</span>
        </Link>
        <p className="mt-10 text-sm text-muted-foreground">{msg}</p>
        <Link to="/" className="btn-lime mt-6 inline-flex">
          Home
        </Link>
      </div>
    </div>
  );
}
