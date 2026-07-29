import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Share2, Download, Trash2, Shield, LifeBuoy, Wrench } from "lucide-react";
import { exportMyData, deleteMyAccount } from "@/lib/account.functions";
import { useServerFn } from "@tanstack/react-start";
import { ProblemReportDialog } from "@/components/ProblemReportDialog";

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [showProblem, setShowProblem] = useState(false);
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
          .select("display_name, handle, bio, is_public, is_admin")
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

      <PrivacyAndData email={email} />

      <div className="card-surface p-5">
        <p className="text-xs uppercase tracking-widest text-primary flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> Legal & Safety
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Privacy, terms, community rules, deletion, and safety notices.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Link to="/legal" className="rounded-full border border-border px-3 py-2 text-center uppercase tracking-widest hover:bg-surface-2">Legal Center</Link>
          <Link to="/legal/privacy" className="rounded-full border border-border px-3 py-2 text-center uppercase tracking-widest hover:bg-surface-2">Privacy</Link>
          <Link to="/legal/terms" className="rounded-full border border-border px-3 py-2 text-center uppercase tracking-widest hover:bg-surface-2">Terms</Link>
          <Link to="/legal/account-deletion" className="rounded-full border border-border px-3 py-2 text-center uppercase tracking-widest hover:bg-surface-2">Deletion</Link>
        </div>
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

function PrivacyAndData({ email }: { email: string }) {
  const exportFn = useServerFn(exportMyData);
  const deleteFn = useServerFn(deleteMyAccount);
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  async function doExport() {
    setExporting(true);
    try {
      const bundle = await exportFn();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drip-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function doDelete() {
    if (confirmEmail.toLowerCase() !== email.toLowerCase()) {
      return toast.error("Type your account email exactly to confirm.");
    }
    if (!password) return toast.error("Enter your password to re-authenticate.");
    setDeleting(true);
    try {
      // Re-authenticate via password sign-in as an ownership check.
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw new Error("Password did not match. Deletion cancelled.");
      await deleteFn({ data: { confirmEmail } });
      await supabase.auth.signOut();
      toast.success("Account deleted");
      navigate({ to: "/", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="card-surface p-5 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">Privacy & Data</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Your closet, outfits, photos, and feedback stay private unless you flip an outfit to public.
          See{" "}
          <Link to="/legal/privacy" className="text-primary underline">
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
      </div>
      <button
        onClick={doExport}
        disabled={exporting}
        className="w-full rounded-full border border-border py-3 text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-surface-2"
      >
        <Download className="h-3.5 w-3.5" />
        {exporting ? "Preparing export…" : "Export my data (JSON)"}
      </button>

      {!showDelete ? (
        <button
          onClick={() => setShowDelete(true)}
          className="w-full rounded-full border border-destructive/50 py-3 text-xs uppercase tracking-widest text-destructive flex items-center justify-center gap-2"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete account
        </button>
      ) : (
        <div className="rounded-lg border border-destructive/60 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs text-destructive font-semibold uppercase tracking-widest">
            This permanently deletes your account
          </p>
          <p className="text-xs text-muted-foreground">
            Every closet item, outfit, photo, feedback row, and your login will be removed. This
            cannot be undone.
          </p>
          <input
            type="email"
            placeholder={`Type ${email} to confirm`}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            className={inp}
          />
          <input
            type="password"
            placeholder="Your password (re-authenticate)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inp}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowDelete(false);
                setConfirmEmail("");
                setPassword("");
              }}
              className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              onClick={doDelete}
              disabled={deleting}
              className="flex-1 rounded-full bg-destructive py-2 text-xs uppercase tracking-widest text-destructive-foreground disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Permanently delete"}
            </button>
          </div>
        </div>
      )}
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
