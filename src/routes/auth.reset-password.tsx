import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/reset-password")({
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

const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the link is opened.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setHasRecovery(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecovery(true);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const p = passwordSchema.safeParse(password);
    if (!p.success) {
      setErr(p.error.issues[0].message);
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: p.data });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    toast.success("Password updated. Signing you in…");
    navigate({ to: "/home", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-10">
        <h1 className="font-display text-4xl leading-none">Reset password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a new password (8+ characters).
        </p>

        {!ready ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : !hasRecovery ? (
          <div className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
            <p>
              This link is invalid or expired. Head back to{" "}
              <a href="/auth" className="text-primary underline">
                sign in
              </a>{" "}
              and tap “Forgot password” to get a new one.
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
