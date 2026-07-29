import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Safe seed for the "Recreate with my closet" flow. Given a public outfit
 * slug, returns ONLY public, non-identifying fields the /inspo builder can
 * use to suggest a look from the current viewer's own closet.
 *
 * We never expose:
 * - the original owner's closet_item ids
 * - signed storage URLs
 * - private notes / prices / brands the owner did not choose to publish
 *
 * The published metadata (category, color, role, vibe, occasion) is already
 * visible on the public page, so returning it here does not leak new data.
 */
export type RecreateSeedPiece = {
  role: string | null;
  category: string;
  color: string | null;
};

export type RecreateSeed = {
  vibe: string | null;
  occasion: string | null;
  dress_code: string | null;
  weather: string | null;
  temperature_f: number | null;
  pieces: RecreateSeedPiece[];
};

export const getRecreateSeed = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ slug: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data }): Promise<RecreateSeed | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: outfit } = await supabaseAdmin
      .from("saved_outfits")
      .select("id, visibility, vibe, occasion, dress_code, weather, temperature_f")
      .eq("share_slug", data.slug)
      .maybeSingle();
    if (!outfit || outfit.visibility !== "public") return null;

    const { data: items } = await supabaseAdmin
      .from("outfit_items")
      .select("role, closet_items!inner(category, color)")
      .eq("outfit_id", outfit.id);

    type Row = { role: string | null; closet_items: { category: string; color: string | null } };
    const pieces: RecreateSeedPiece[] = ((items ?? []) as unknown as Row[]).map((r) => ({
      role: r.role,
      category: r.closet_items.category,
      color: r.closet_items.color,
    }));

    return {
      vibe: outfit.vibe,
      occasion: outfit.occasion,
      dress_code: (outfit.dress_code as string | null) ?? null,
      weather: outfit.weather,
      temperature_f: outfit.temperature_f,
      pieces,
    };
  });

/** Serialise a seed into router search params for /inspo. */
export function buildRecreateSearch(seed: RecreateSeed): Record<string, string> {
  const params: Record<string, string> = { seed: "recreate" };
  if (seed.vibe) params.vibe = seed.vibe;
  if (seed.occasion) params.occasion = seed.occasion;
  if (seed.dress_code) params.dress_code = seed.dress_code;
  if (seed.weather) params.weather = seed.weather;
  if (typeof seed.temperature_f === "number") params.temp = String(seed.temperature_f);
  // Encode categories only — never any private ids.
  const cats = seed.pieces
    .map((p) => p.category)
    .filter((c): c is string => !!c);
  if (cats.length) params.cats = cats.slice(0, 8).join(",");
  return params;
}
