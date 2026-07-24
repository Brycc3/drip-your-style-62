import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public share endpoint. Anon-safe: validates the outfit is visibility=public,
 * then signs closet image paths so visitors get short-lived URLs without
 * being able to browse the private bucket.
 */
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
      return { cover: null as string | null, pieces: {} as Record<string, string> };
    }

    const { data: items } = await supabaseAdmin
      .from("outfit_items")
      .select("closet_item_id, closet_items!inner(id, image_url)")
      .eq("outfit_id", outfit.id);

    const paths: string[] = [];
    const idByPath: Record<string, string> = {};
    for (const row of (items ?? []) as Array<{ closet_items: { id: string; image_url: string | null } }>) {
      const ci = row.closet_items;
      if (ci?.image_url) { paths.push(ci.image_url); idByPath[ci.image_url] = ci.id; }
    }
    if (outfit.cover_image_url && !idByPath[outfit.cover_image_url]) paths.push(outfit.cover_image_url);

    const pieces: Record<string, string> = {};
    let cover: string | null = null;
    if (paths.length) {
      const { data: signed } = await supabaseAdmin.storage.from("closet").createSignedUrls(paths, 60 * 60);
      for (const s of signed ?? []) {
        if (!s.signedUrl || !s.path) continue;
        const id = idByPath[s.path];
        if (id) pieces[id] = s.signedUrl;
        if (s.path === outfit.cover_image_url) cover = s.signedUrl;
      }
    }
    return { cover, pieces };
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
