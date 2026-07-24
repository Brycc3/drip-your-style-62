import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public share endpoint. Anon-safe: validates the outfit is visibility=public,
 * then signs closet image paths so visitors get short-lived URLs without
 * being able to browse the private bucket.
 */
export type PublicPiece = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  color: string | null;
  role: string | null;
  url: string | null;
};

export const getPublicOutfitAssets = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => z.object({ slug: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: outfit } = await supabaseAdmin
      .from("saved_outfits")
      .select("id, visibility, cover_image_url")
      .eq("share_slug", data.slug)
      .maybeSingle();

    if (!outfit || outfit.visibility !== "public") {
      return { cover: null as string | null, pieces: [] as PublicPiece[] };
    }

    const { data: items } = await supabaseAdmin
      .from("outfit_items")
      .select("role, closet_item_id, closet_items!inner(id, name, category, brand, color, image_url)")
      .eq("outfit_id", outfit.id);

    type Row = { role: string | null; closet_items: { id: string; name: string; category: string; brand: string | null; color: string | null; image_url: string | null } };
    const rows = (items ?? []) as unknown as Row[];

    const paths = rows.map((r) => r.closet_items.image_url).filter(Boolean) as string[];
    if (outfit.cover_image_url && !paths.includes(outfit.cover_image_url)) paths.push(outfit.cover_image_url);

    const urlByPath: Record<string, string> = {};
    if (paths.length) {
      const { data: signed } = await supabaseAdmin.storage.from("closet").createSignedUrls(paths, 60 * 60);
      for (const s of signed ?? []) if (s.signedUrl && s.path) urlByPath[s.path] = s.signedUrl;
    }

    const pieces: PublicPiece[] = rows.map((r) => ({
      id: r.closet_items.id,
      name: r.closet_items.name,
      category: r.closet_items.category,
      brand: r.closet_items.brand,
      color: r.closet_items.color,
      role: r.role,
      url: r.closet_items.image_url ? (urlByPath[r.closet_items.image_url] ?? null) : null,
    }));

    return {
      cover: outfit.cover_image_url ? (urlByPath[outfit.cover_image_url] ?? null) : null,
      pieces,
    };
  });

/**
 * Signs the cover image only, for lightweight feed thumbnails.
 * Returns url only when the outfit is public.
 */
export const getPublicOutfitCovers = createServerFn({ method: "POST" })
  .inputValidator((input: { slugs: string[] }) =>
    z.object({ slugs: z.array(z.string().min(1).max(80)).max(60) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (!data.slugs.length) return {} as Record<string, string>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("saved_outfits")
      .select("share_slug, visibility, cover_image_url")
      .in("share_slug", data.slugs);
    const wanted = (rows ?? []).filter((r) => r.visibility === "public" && r.cover_image_url);
    if (!wanted.length) return {};
    const { data: signed } = await supabaseAdmin.storage
      .from("closet")
      .createSignedUrls(wanted.map((w) => w.cover_image_url!), 60 * 60);
    const bySlug: Record<string, string> = {};
    const pathToSlug = Object.fromEntries(wanted.map((w) => [w.cover_image_url!, w.share_slug!]));
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path && pathToSlug[s.path]) bySlug[pathToSlug[s.path]] = s.signedUrl;
    }
    return bySlug;
  });
