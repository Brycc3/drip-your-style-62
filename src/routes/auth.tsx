import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { checkEmailProviders } from "@/lib/auth-check.functions";
import { toast } from "sonner";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — DRIP" },
      { name: "description", content: "Sign in or create your DRIP account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const navigate = useNavigate();

  async function sendReset() {
    setFormError(null);
    const emailR = emailSchema.safeParse(email);
    if (!emailR.success) {
      setFormError("Enter your email above first, then tap Forgot password.");
      return;
    }
    setRecoveryBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(emailR.data, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setRecoveryBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reset link sent. Check your email.");
  }

  async function resendConfirmation() {
    setFormError(null);
    const emailR = emailSchema.safeParse(email);
    if (!emailR.success) {
      setFormError("Enter your email above first, then tap Resend.");
      return;
    }
    setRecoveryBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: emailR.data,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setRecoveryBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Confirmation email re-sent.");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const emailR = emailSchema.safeParse(email);
    if (!emailR.success) {
      setFormError(emailR.error.issues[0].message);
      return;
    }
    const passR = passwordSchema.safeParse(password);
    if (!passR.success) {
      setFormError(passR.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: emailR.data,
          password: passR.data,
          options: { emailRedirectTo: `${window.location.origin}/onboarding` },
        });
        if (error) {
          setFormError(error.message);
          return;
        }
        // With auto-confirm on, a session is returned immediately.
        if (data.session) {
          navigate({ to: "/onboarding", replace: true });
          return;
        }
        // Fallback: try to sign in immediately (in case auto-confirm toggles later).
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: emailR.data,
          password: passR.data,
        });
        if (signInErr) {
          setFormError("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
          return;
        }
        navigate({ to: "/onboarding", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailR.data,
          password: passR.data,
        });
        if (error) {
          try {
            const info = await checkEmailProviders({ data: { email: emailR.data } });
            if (
              info.exists &&
              info.providers.includes("google") &&
              !info.providers.includes("email")
            ) {
              setFormError("This email uses Google sign-in. Tap Continue with Google below.");
            } else if (info.exists && !info.confirmed) {
              setNeedsConfirm(true);
              setFormError("Please confirm your email first — check your inbox.");
            } else {
              setFormError("Wrong email or password.");
            }
          } catch {
            setFormError(error.message);
          }
          return;
        }
        navigate({ to: "/home", replace: true });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setFormError(null);
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setFormError(result.error.message ?? "Google sign-in failed");
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/home", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-10">
        <Link to="/" className="font-display text-xl tracking-widest text-foreground">
          DRIP<span className="text-primary">.</span>
        </Link>

        <h1 className="mt-10 font-display text-4xl leading-none">
          {mode === "signup" ? "Start your closet" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Create an account with email — every piece stays private to you."
            : "Sign in to your wardrobe."}
        </p>

        <form onSubmit={handleEmail} className="mt-8 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-border bg-input px-4 py-3 text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Password <span className="normal-case tracking-normal">(8+ characters)</span>
            </span>
            <div className="relative mt-1">
              <input
                type={showPw ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-4 py-3 pr-16 text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-3 my-auto h-8 rounded-md px-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-lime w-full disabled:opacity-50">
            {loading ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {mode === "signin" && (
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={sendReset}
                disabled={recoveryBusy}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Forgot password?
              </button>
              {needsConfirm && (
                <button
                  type="button"
                  onClick={resendConfirmation}
                  disabled={recoveryBusy}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  Resend confirmation
                </button>
              )}
            </div>
          )}
          {mode === "signup" && (
            <button
              type="button"
              onClick={resendConfirmation}
              disabled={recoveryBusy}
              className="block w-full text-left text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Didn't get the confirmation email? Resend
            </button>
          )}
        </form>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-surface py-3 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <button
          className="mt-6 block w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setFormError(null);
            setMode(mode === "signup" ? "signin" : "signup");
          }}
        >
          {mode === "signup" ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.75-6-6.15S8.7 6.2 12 6.2c1.9 0 3.15.8 3.87 1.5l2.65-2.55C16.85 3.55 14.65 2.5 12 2.5 6.75 2.5 2.5 6.75 2.5 12S6.75 21.5 12 21.5c6.9 0 9.5-4.85 9.5-7.35 0-.5-.05-.9-.15-1.3H12z"
      />
    </svg>
  );
}
