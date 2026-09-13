import { z } from "zod";

export const STYLE_VIBES = [
  "Streetwear",
  "Minimal",
  "Techwear",
  "Preppy",
  "Old-money",
  "Grunge",
  "Sporty",
  "Vintage",
];
export const STYLE_COLORS = [
  "Black",
  "Cream",
  "Olive",
  "Charcoal",
  "Brown",
  "Navy",
  "Sage",
  "Rust",
];
export const BUDGET_CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "JPY"] as const;
export type ShoppingBudget = { amount: number; currency: string };
const budgetSchema = z.object({
  amount: z.number().finite().positive().max(1000000),
  currency: z.enum(BUDGET_CURRENCIES),
});

// Existing text column; explicit version-independent CURRENCY:amount format.
// Legacy ranges have no reliable currency or ceiling: never invent one.
export function parseBudget(value?: string | null): ShoppingBudget | null {
  const match = /^([A-Z]{3}):([0-9]+(?:\.[0-9]{1,2})?)$/.exec(value ?? "");
  if (!match) return null;
  const parsed = budgetSchema.safeParse({ currency: match[1], amount: Number(match[2]) });
  return parsed.success ? parsed.data : null;
}

export const stylePreferencesSchema = z.object({
  style_vibes: z.array(z.string().trim().min(2).max(60)).max(12),
  favorite_colors: z.array(z.string().trim().min(2).max(30)).max(12),
  sizes: z.object({
    top: z.string().trim().max(30),
    bottom: z.string().trim().max(30),
    shoe: z.string().trim().max(30),
  }),
  budget_range: z
    .string()
    .nullable()
    .refine(
      (v) => v === null || parseBudget(v) !== null,
      "Enter a positive per-item budget and supported currency.",
    ),
});
export type StylePreferences = z.infer<typeof stylePreferencesSchema>;
export function readStylePreferences(
  row?: {
    style_vibes?: string[];
    favorite_colors?: string[];
    sizes?: unknown;
    budget_range?: string | null;
  } | null,
): StylePreferences {
  const sizes =
    row?.sizes && typeof row.sizes === "object" ? (row.sizes as Record<string, unknown>) : {};
  return {
    style_vibes: row?.style_vibes ?? [],
    favorite_colors: row?.favorite_colors ?? [],
    sizes: {
      top: typeof sizes.top === "string" ? sizes.top : "",
      bottom: typeof sizes.bottom === "string" ? sizes.bottom : "",
      shoe: typeof sizes.shoe === "string" ? sizes.shoe : "",
    },
    budget_range: parseBudget(row?.budget_range) ? row!.budget_range! : null,
  };
}
