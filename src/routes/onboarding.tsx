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

const VIBES = [
  "Streetwear",
  "Minimal",
  "Techwear",
  "Preppy",
  "Old-money",
  "Grunge",
  "Sporty",
  "Vintage",
  "Other",
] as const;
const COLORS = ["Black", "Cream", "Olive", "Charcoal", "Brown", "Navy", "Sage", "Rust"] as const;

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [customVibe, setCustomVibe] = useState("");
  const [customVibeError, setCustomVibeError] = useState<string | null>(null);
  const [favColors, setFavColors] = useState<string[]>([]);
  const [topSize, setTopSize] = useState("M");
  const [bottomSize, setBottomSize] = useState("32");
  const [shoeSize, setShoeSize] = useState("10");
  const [saving, setSaving] = useState(false);

  const otherSelected = vibes.includes("Other");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name,onboarded")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.onboarded) navigate({ to: "/home", replace: true });
        if (data?.display_name) setDisplayName(data.display_name);
      });
  }, [user, navigate]);

  function toggle<T extends string>(arr: T[], v: T, setter: (n: T[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function validateCustomVibe(): string | null {
    if (!otherSelected) return null;
    const t = customVibe.trim();
    if (t.length < 2) return "Describe your vibe (2–60 characters)";
    if (t.length > 60) return "Keep it under 60 characters";
    return null;
  }

  function handleContinue() {
    if (step === 2) {
      const err = validateCustomVibe();
      setCustomVibeError(err);
      if (err) return;
    }
    setStep(step + 1);
  }

  async function finish(destination: "closet" | "home") {
    if (!user) return;
    const err = validateCustomVibe();
    if (err) {
      setCustomVibeError(err);
      setStep(2);
      return;
    }
    setSaving(true);
    try {
      // Never persist the literal "Other" — replace it with the custom text.
      const finalVibes = vibes
        .filter((v) => v !== "Other")
        .concat(otherSelected ? [customVibe.trim()] : []);
      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName || null,
        onboarded: true,
      });
      if (pErr) throw pErr;
      const { error: prefErr } = await supabase.from("user_preferences").upsert({
        user_id: user.id,
        style_vibes: finalVibes,
        favorite_colors: favColors,
        sizes: { top: topSize, bottom: bottomSize, shoe: shoeSize },
        custom_vibes: otherSelected ? [customVibe.trim()] : [],
      });
      if (prefErr) throw prefErr;
      navigate({ to: destination === "closet" ? "/closet/new" : "/home", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="container-app py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Step {step} of 4</p>
        <h1 className="mt-2 font-display text-4xl">
          {step === 1 && "Who are you"}
          {step === 2 && "Your vibe"}
          {step === 3 && "Your sizes"}
          {step === 4 && "Starter closet"}
        </h1>

        <div className="mt-8">
          {step === 1 && (
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Display name
              </span>
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
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Pick your vibes
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <Chip
                    key={v}
                    active={vibes.includes(v)}
                    onClick={() => toggle(vibes, v, setVibes)}
                  >
                    {v}
                  </Chip>
                ))}
              </div>
              {otherSelected && (
                <label className="mt-4 block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    Describe your vibe
                  </span>
                  <input
                    value={customVibe}
                    onChange={(e) => {
                      setCustomVibe(e.target.value);
                      if (customVibeError) setCustomVibeError(null);
                    }}
                    placeholder="e.g. clean Houston streetwear, vintage athlete"
                    maxLength={60}
                    className="mt-1 w-full rounded-lg border border-border bg-input px-4 py-3 outline-none focus:border-primary"
                  />
                  {customVibeError && (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      {customVibeError}
                    </p>
                  )}
                </label>
              )}
              <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">
                Favorite colors
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <Chip
                    key={c}
                    active={favColors.includes(c)}
                    onClick={() => toggle(favColors, c, setFavColors)}
                  >
                    {c}
                  </Chip>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <SizeInput label="Top size (S / M / L / XL)" value={topSize} onChange={setTopSize} />
              <SizeInput
                label="Bottom size (waist or number)"
                value={bottomSize}
                onChange={setBottomSize}
              />
              <SizeInput label="Shoe size (US)" value={shoeSize} onChange={setShoeSize} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-foreground/85">
                DRIP builds outfits from what you own. For a balanced starting rotation, aim for a{" "}
                <span className="text-primary">3-2-2 starter</span>:
              </p>
              <ul className="card-surface space-y-2 p-4 text-sm">
                <li className="flex items-center justify-between">
                  <span>3 tops (tee, hoodie, button-up)</span>
                  <span className="text-primary">3</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>2 bottoms (denim + cargos or joggers)</span>
                  <span className="text-primary">2</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>2 pairs of shoes (one clean, one rugged)</span>
                  <span className="text-primary">2</span>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                That's 7 pieces — enough to start generating honestly and get gap analysis. Add more
                anytime.
              </p>
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
          {step < 4 ? (
            <button onClick={handleContinue} className="btn-lime flex-1">
              Continue
            </button>
          ) : (
            <>
              <button
                onClick={() => finish("home")}
                disabled={saving}
                className="flex-1 rounded-full border border-border py-3 text-sm uppercase tracking-widest text-foreground/80 disabled:opacity-50"
              >
                Go to Home
              </button>
              <button
                onClick={() => finish("closet")}
                disabled={saving}
                className="btn-lime flex-1 disabled:opacity-50"
              >
                {saving ? "…" : "Add First Item"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
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

function SizeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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
