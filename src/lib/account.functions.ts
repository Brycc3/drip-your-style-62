// Data export + full account deletion server functions.
// Runs as the authenticated user via requireSupabaseAuth, then loads the admin
// client inside the handler for privileged auth.users deletion.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Dynamic table names — we intentionally use `any` on the supabase client for
// these loops because the generated Database type narrows table names to a
// literal union and does not accept a string variable.
type AnyRow = Record<string, unknown>;

const OWNED_TABLES = [
  "closet_items",
  "saved_outfits",
  "outfit_items",
  "outfit_feedback",
  "wear_history",
  "item_wears",
  "fragrances",
  "user_preferences",
  "outfit_comments",
  "outfit_likes",
  "outfit_saves",
  "follows",
  "user_blocks",
] as const;


export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Cast to any: dynamic table names + JSON blob don't play nice with the
    // generated Database types or with the server-fn serializable inference.
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => Promise<{ data: AnyRow[] | null }> & {
            maybeSingle: () => Promise<{ data: AnyRow | null }>;
          };
          in: (col: string, ids: string[]) => Promise<{ data: AnyRow[] | null }>;
          or: (q: string) => Promise<{ data: AnyRow[] | null }>;
        };
      };
    };
    const bundle: Record<string, unknown> = {
      user_id: userId,
      exported_at: new Date().toISOString(),
    };

    const [{ data: profile }, { data: prefs }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
      sb.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    bundle.profile = profile ?? null;
    bundle.preferences = prefs ?? null;

    for (const table of OWNED_TABLES) {
      if (table === "user_preferences") continue;
      if (table === "follows") {
        const { data } = await sb
          .from("follows")
          .select("*")
          .or(`follower_id.eq.${userId},followee_id.eq.${userId}`);
        bundle[table] = data ?? [];
        continue;
      }
      if (table === "user_blocks") {
        const { data } = await sb.from("user_blocks").select("*").eq("blocker_id", userId);
        bundle[table] = data ?? [];
        continue;
      }
      if (table === "outfit_items") {
        const { data: outfits } = await sb
          .from("saved_outfits")
          .select("id")
          .eq("user_id", userId);
        const ids = (outfits ?? []).map((o) => String(o.id));
        if (ids.length === 0) {
          bundle[table] = [];
          continue;
        }
        const { data } = await sb.from("outfit_items").select("*").in("outfit_id", ids);
        bundle[table] = data ?? [];
        continue;
      }
      const { data } = await sb.from(table).select("*").eq("user_id", userId);
      bundle[table] = data ?? [];
    }

    // JSON-round-trip guarantees the value is serializable for the server-fn boundary.
    return JSON.parse(JSON.stringify(bundle)) as { user_id: string; exported_at: string };
  });


export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ confirmEmail: z.string().email() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId, claims } = context;

    const email = (claims as { email?: string }).email;
    if (!email || email.toLowerCase() !== data.confirmEmail.toLowerCase()) {
      throw new Error("Email confirmation did not match your account email.");
    }

    const { supabaseAdmin: _admin } = await import("@/integrations/supabase/client.server");
    // Cast for dynamic table names.
    const admin = _admin as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          in: (col: string, vals: string[]) => Promise<{ error: { message: string } | null }>;
          or: (q: string) => Promise<{ error: { message: string } | null }>;
        };
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
      storage: typeof _admin.storage;
      auth: typeof _admin.auth;
    };

    // Delete storage objects under closet/<uid>/
    try {
      const { data: files } = await _admin.storage.from("closet").list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await _admin.storage.from("closet").remove(paths);
      }
    } catch (e) {
      console.error("[deleteMyAccount] storage cleanup failed", e);
    }

    await admin
      .from("content_reports")
      .update({ reporter_id: null })
      .eq("reporter_id", userId);

    // outfit_items via saved_outfits ids
    const sbUser = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => Promise<{ data: { id: string }[] | null }>;
        };
      };
    };
    const { data: outfits } = await sbUser
      .from("saved_outfits")
      .select("id")
      .eq("user_id", userId);
    const outfitIds = (outfits ?? []).map((o) => String(o.id));
    if (outfitIds.length > 0) {
      await admin.from("outfit_items").delete().in("outfit_id", outfitIds);
    }

    for (const table of OWNED_TABLES) {
      if (table === "outfit_items") continue;
      if (table === "follows") {
        await admin
          .from("follows")
          .delete()
          .or(`follower_id.eq.${userId},followee_id.eq.${userId}`);
        continue;
      }
      if (table === "user_blocks") {
        await admin
          .from("user_blocks")
          .delete()
          .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
        continue;
      }
      await admin.from(table).delete().eq("user_id", userId);
    }
    await admin.from("profiles").delete().eq("id", userId);


    // Finally: auth.users
    const { error: delErr } = await _admin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error(`Account row deleted, but auth user removal failed: ${delErr.message}`);

    return { ok: true };
  });
