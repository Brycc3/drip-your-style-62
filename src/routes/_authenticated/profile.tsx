import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — DRIP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      setEmail(userData.user?.email ?? "");
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle();
      setDisplayName(profile?.display_name ?? "");
      const { data: prefs } = await supabase.from("user_preferences").select("style_vibes,favorite_colors").eq("user_id", uid).maybeSingle();
      setVibes(prefs?.style_vibes ?? []);
      setColors(prefs?.favorite_colors ?? []);
    })();
  }, []);

  async function save() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName || null }).eq("id", uid);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">You</p>
        <h1 className="mt-1 font-display text-4xl">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-input px-4 py-3 outline-none focus:border-primary"
          maxLength={40}
        />
      </label>
      <button onClick={save} disabled={saving} className="btn-lime w-full disabled:opacity-50">
        {saving ? "Saving…" : "Save"}
      </button>

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
