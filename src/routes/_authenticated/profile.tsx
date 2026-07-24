import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Share2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [{ title: "Profile — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

function ProfilePage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [vibes, setVibes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user?.id;
      if (!u) return;
      setUid(u);
      setEmail(userData.user?.email ?? "");
      const [{ data: profile }, { data: prefs }, { count: fw }, { count: fg }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, handle, bio, is_public")
          .eq("id", u)
          .maybeSingle(),
        supabase
          .from("user_preferences")
          .select("style_vibes,favorite_colors")
          .eq("user_id", u)
          .maybeSingle(),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("followee_id", u),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", u),
      ]);
      setDisplayName(profile?.display_name ?? "");
      setHandle(profile?.handle ?? "");
      setBio(profile?.bio ?? "");
      setIsPublic(profile?.is_public ?? false);
      setVibes(prefs?.style_vibes ?? []);
      setColors(prefs?.favorite_colors ?? []);
      setFollowers(fw ?? 0);
      setFollowing(fg ?? 0);
    })();
  }, []);

  async function save() {
    if (!uid) return;
    const trimmedHandle = handle.trim().toLowerCase();
    if (trimmedHandle && !HANDLE_RE.test(trimmedHandle)) {
      return toast.error("Handle: 3–20 chars, lowercase, letters/numbers/_");
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        handle: trimmedHandle || null,
        bio: bio || null,
        is_public: isPublic,
      })
      .eq("id", uid);
    setSaving(false);
    if (error) {
      if (error.message.includes("duplicate")) toast.error("That handle is taken");
      else toast.error(error.message);
    } else toast.success("Saved");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function copyPublicLink() {
    if (!handle) return toast.error("Set a handle first");
    navigator.clipboard.writeText(`${window.location.origin}/u/${handle}`);
    toast.success("Link copied");
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">You</p>
        <h1 className="mt-1 font-display text-4xl">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      </div>

      <div className="card-surface p-5">
        <p className="text-xs uppercase tracking-widest text-primary">Social</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="font-display text-2xl">{followers}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Followers</p>
          </div>
          <div>
            <p className="font-display text-2xl">{following}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Following</p>
          </div>
        </div>
        {handle && isPublic && (
          <div className="mt-4 flex gap-2">
            <Link
              to="/u/$handle"
              params={{ handle }}
              className="btn-lime flex-1 flex items-center justify-center gap-1 !py-2 text-xs"
            >
              <Users className="h-3 w-3" /> View public
            </Link>
            <button
              onClick={copyPublicLink}
              className="rounded-full border border-border px-4 py-2 text-xs uppercase tracking-widest flex items-center gap-1"
            >
              <Share2 className="h-3 w-3" /> Copy
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            className={inp}
          />
        </Field>
        <Field label="Handle (letters, numbers, underscore)">
          <div className="mt-1 flex overflow-hidden rounded-lg border border-border bg-input">
            <span className="flex items-center px-3 text-sm text-muted-foreground">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              maxLength={20}
              className="flex-1 bg-transparent px-2 py-3 outline-none"
              placeholder="yourname"
            />
          </div>
        </Field>
        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={200}
            rows={2}
            className={inp}
          />
        </Field>
        <label className="card-surface flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium">Public profile</p>
            <p className="text-xs text-muted-foreground">
              Anyone with your link can see your public outfits.
            </p>
          </div>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
        <button onClick={save} disabled={saving} className="btn-lime w-full disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="card-surface p-5">
        <p className="text-xs uppercase tracking-widest text-primary">Your vibe</p>
        <p className="mt-2 text-sm text-foreground/85">
          {vibes.length ? vibes.join(" · ") : "No vibes set"}
        </p>
        <p className="mt-3 text-xs uppercase tracking-widest text-primary">Colors</p>
        <p className="mt-1 text-sm text-foreground/85">
          {colors.length ? colors.join(" · ") : "No colors set"}
        </p>
      </div>

      <button
        onClick={signOut}
        className="w-full rounded-full border border-destructive/50 py-3 text-sm uppercase tracking-widest text-destructive"
      >
        Sign out
      </button>
    </div>
  );
}

const inp =
  "mt-1 w-full rounded-lg border border-border bg-input px-4 py-3 outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
