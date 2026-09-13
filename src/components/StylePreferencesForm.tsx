import { useState } from "react";
import {
  BUDGET_CURRENCIES,
  parseBudget,
  STYLE_VIBES,
  STYLE_COLORS,
  stylePreferencesSchema,
  type StylePreferences,
} from "@/lib/style-preferences";

export function StylePreferencesForm({
  initial,
  onSave,
}: {
  initial: StylePreferences;
  onSave: (value: StylePreferences) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const budget = parseBudget(initial.budget_range);
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "");
  const [currency, setCurrency] = useState(budget?.currency ?? "USD");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const toggle = (key: "style_vibes" | "favorite_colors", item: string) => {
    setSaved(false);
    setValue((v) => ({
      ...v,
      [key]: v[key].includes(item) ? v[key].filter((x) => x !== item) : [...v[key], item],
    }));
  };
  return (
    <form
      className="card-surface space-y-5 p-5"
      onChange={() => setSaved(false)}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        const parsed = stylePreferencesSchema.safeParse({
          ...value,
          budget_range: amount.trim() ? `${currency}:${amount.trim()}` : null,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setBusy(true);
        try {
          await onSave(parsed.data);
          setSaved(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save preferences. Try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <h2 className="font-display text-2xl">Your style, remembered</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set sizes and preferences once. Edit them here anytime; Shop and Create use your saved
          choices.
        </p>
      </div>
      <fieldset disabled={busy} className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">Vibes</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...new Set([...STYLE_VIBES, ...value.style_vibes])].map((v) => (
              <button
                type="button"
                key={v}
                aria-pressed={value.style_vibes.includes(v)}
                onClick={() => toggle("style_vibes", v)}
                className={`rounded-full border px-3 py-2 text-xs ${value.style_vibes.includes(v) ? "border-primary text-primary" : "border-border"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs">
            Custom vibe
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={60}
              className={input}
            />
          </label>
          <button
            type="button"
            disabled={custom.trim().length < 2}
            className="mt-2 text-sm text-primary disabled:opacity-50"
            onClick={() => {
              if (!value.style_vibes.includes(custom.trim())) toggle("style_vibes", custom.trim());
              setCustom("");
            }}
          >
            Add custom vibe
          </button>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">Favorite colors</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...new Set([...STYLE_COLORS, ...value.favorite_colors])].map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={value.favorite_colors.includes(c)}
                onClick={() => toggle("favorite_colors", c)}
                className={`rounded-full border px-3 py-2 text-xs ${value.favorite_colors.includes(c) ? "border-primary text-primary" : "border-border"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["top", "bottom", "shoe"] as const).map((s) => (
            <label key={s} className="min-w-0 text-xs capitalize">
              {s} size
              <input
                value={value.sizes[s]}
                maxLength={30}
                placeholder="Not set"
                className={input}
                onChange={(e) =>
                  setValue((v) => ({ ...v, sizes: { ...v.sizes, [s]: e.target.value } }))
                }
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Include your sizing system where needed, e.g. US 10 or EU 43. Retailer measurements may
          differ.
        </p>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <label className="min-w-0 text-xs">
            Per-item spending limit (optional)
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={input}
              placeholder="No limit set"
            />
          </label>
          <label className="text-xs">
            Currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={input}
            >
              {BUDGET_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Item price only, before tax or delivery. We don’t convert currencies or infer your total
          shopping budget.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-primary">
            Preferences saved. Your next Shop and Create visit will use them.
          </p>
        )}
        <button disabled={busy} className="btn-lime w-full disabled:opacity-50">
          {busy ? "Saving…" : "Save preferences"}
        </button>
      </fieldset>
    </form>
  );
}
const input =
  "mt-1 w-full min-w-0 rounded-lg border border-border bg-input px-3 py-3 text-sm outline-none focus:border-primary";
