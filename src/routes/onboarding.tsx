import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Get set up — DRIP" },
      { name: "description", content: "Set your style vibes and sizes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

const VIBES = ["Streetwear", "Minimal", "Techwear", "Preppy", "Old-money", "Grunge", "Sporty", "Vintage"] as const;
const COLORS = ["Black", "Cream", "Olive", "Charcoal", "Brown", "Navy", "Sage", "Rust"] as const;

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [favColors, setFavColors] = useState<string[]>([]);
  const [topSize, setTopSize] = useState("M");
  const [bottomSize, setBottomSize] = useState("32");
  const [shoeSize, setShoeSize] = useState("10");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name,onboarded").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.onboarded) navigate({ to: "/home", replace: true });
      if (data?.display_name) setDisplayName(data.display_name);
    });
  }, [user, navigate]);

  function toggle<T extends string>(arr: T[], v: T, setter: (n: T[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  async function finish() {
    if (!user) return;
    setSaving(true);
    try {
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName || null,
        onboarded: true,
      });
      if (pErr) throw pErr;
      const { error: prefErr } = await supabase.from("user_preferences").upsert({
        user_id: user.id,
        style_vibes: vibes,
        favorite_colors: favColors,
        sizes: { top: topSize, bottom: bottomSize, shoe: shoeSize },
      });
      if (prefErr) throw prefErr;
      navigate({ to: "/home", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Step {step} of 3</p>
        <h1 className="mt-2 font-display text-4xl">
          {step === 1 && "Who are you"}
          {step === 2 && "Your vibe"}
          {step === 3 && "Your sizes"}
        </h1>

        <div className="mt-8">
          {step === 1 && (
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How friends know you"
                className="mt-1 w-full rounded-lg border border-border bg-input px-4 py-3 outline-none focus:border-primary"
                maxLength={40}
              />
            </label>
          )}

          {step === 2 && (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Pick your vibes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <Chip key={v} active={vibes.includes(v)} onClick={() => toggle(vibes, v, setVibes)}>
                    {v}
                  </Chip>
                ))}
              </div>
              <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">Favorite colors</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <Chip key={c} active={favColors.includes(c)} onClick={() => toggle(favColors, c, setFavColors)}>
                    {c}
                  </Chip>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <SizeInput label="Top size (S / M / L / XL)" value={topSize} onChange={setTopSize} />
              <SizeInput label="Bottom size (waist or number)" value={bottomSize} onChange={setBottomSize} />
              <SizeInput label="Shoe size (US)" value={shoeSize} onChange={setShoeSize} />
            </div>
          )}
        </div>

        <div className="mt-10 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 rounded-full border border-border py-3 text-sm uppercase tracking-widest text-foreground/80"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} className="btn-lime flex-1">
              Continue
            </button>
          ) : (
            <button onClick={finish} disabled={saving} className="btn-lime flex-1 disabled:opacity-50">
              {saving ? "…" : "Enter DRIP"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-foreground/80 hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

function SizeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={8}
        className="mt-1 w-full rounded-lg border border-border bg-input px-4 py-3 outline-none focus:border-primary"
      />
    </label>
  );
}
