import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseRecoveryCallback, validateNewPassword } from "@/lib/reset-password-guard";

export const Route = createFileRoute("/auth_/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — DRIP" },
      { name: "description", content: "Set a new password for your DRIP account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

/**
 * The trailing underscore in this file name keeps /auth/reset-password out
 * of the /auth component tree; the sign-in page is a leaf, not a layout.
 *
 * Password reset must not accept a plain signed-in session. Only a genuine
 * PASSWORD_RECOVERY flow — recognized by Supabase firing the recovery event
 * OR by the URL still carrying the `type=recovery` marker — unlocks the
 * form. Any other case shows the invalid/expired state.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Read the callback before first touching the lazy Supabase client:
    // initializing auth may consume and remove the hash immediately.
    if (typeof window !== "undefined") {
      const callback = parseRecoveryCallback(window.location.hash, window.location.search);
      if (callback.authorized) {
        setHasRecovery(true);
      } else if (callback.error) {
        setErr(callback.error);
      }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") setHasRecovery(true);
    });
    // getSession is used ONLY to know when Supabase finished parsing the URL,
    // not as a substitute for the recovery signal.
    supabase.auth.getSession().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const check = validateNewPassword(password, confirm);
    if (!check.ok) {
      setErr(check.error);
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setComplete(true);
    toast.success("Password updated. You can sign in with your new password.");
    await supabase.auth.signOut({ scope: "local" });
    window.setTimeout(() => {
      navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
    }, 1500);
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-10">
        <h1 className="font-display text-4xl leading-none">Reset password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose a new password (8+ characters).</p>

        {complete ? (
          <div
            role="status"
            className="mt-6 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm"
          >
            <p className="font-medium text-primary">Password updated.</p>
            <p className="mt-1 text-muted-foreground">
              Returning you to sign in. Your recovery session has been closed.
            </p>
          </div>
        ) : !ready ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : !hasRecovery ? (
          <div className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
            <p>
              {err ?? "This reset link is invalid or expired."} Head back to{" "}
              <a href="/auth" className="text-primary underline">
                sign in
              </a>{" "}
              and tap “Forgot password” to get a new one.
            </p>
            <p className="mt-2 text-xs">
              Already signed in? Change your password from Profile — this page only accepts a
              password-recovery email link.
            </p>
          </div>
        ) : (
          <form onSubmit={save} className="mt-8 space-y-3">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                New password
              </span>
              <div className="relative mt-1">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-4 py-3 pr-16 outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-3 my-auto h-8 rounded-md px-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Confirm password
              </span>
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-input px-4 py-3 outline-none focus:border-primary"
              />
            </label>
            {err && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {err}
              </div>
            )}
            <button type="submit" disabled={saving} className="btn-lime w-full disabled:opacity-50">
              {saving ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
