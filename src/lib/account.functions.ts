// Data export + full account deletion server functions.
// Runs as the authenticated user via requireSupabaseAuth, then loads the admin
// client inside the handler for privileged auth.users deletion.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const bundle: Record<string, unknown> = { user_id: userId, exported_at: new Date().toISOString() };

    const [{ data: profile }, { data: prefs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    bundle.profile = profile ?? null;
    bundle.preferences = prefs ?? null;

    // Per-table dumps for anything scoped by user_id.
    for (const table of OWNED_TABLES) {
      if (table === "user_preferences") continue;
      if (table === "follows") {
        const { data } = await supabase.from("follows").select("*").or(`follower_id.eq.${userId},followee_id.eq.${userId}`);
        bundle[table] = data ?? [];
        continue;
      }
      if (table === "user_blocks") {
        const { data } = await supabase.from("user_blocks").select("*").eq("blocker_id", userId);
        bundle[table] = data ?? [];
        continue;
      }
      if (table === "outfit_items") {
        // scoped indirectly via saved_outfits
        const { data: outfits } = await supabase.from("saved_outfits").select("id").eq("user_id", userId);
        const ids = (outfits ?? []).map((o) => o.id);
        if (ids.length === 0) { bundle[table] = []; continue; }
        const { data } = await supabase.from("outfit_items").select("*").in("outfit_id", ids);
        bundle[table] = data ?? [];
        continue;
      }
      const { data } = await supabase.from(table).select("*").eq("user_id", userId);
      bundle[table] = data ?? [];
    }

    return bundle;
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Delete storage objects under closet/<uid>/
    try {
      const { data: files } = await supabaseAdmin.storage.from("closet").list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("closet").remove(paths);
      }
    } catch (e) {
      console.error("[deleteMyAccount] storage cleanup failed", e);
    }

    // DB rows. auth.users delete cascades most, but we scrub explicitly first
    // to protect against missing FKs and to null-out reports.
    await supabaseAdmin.from("content_reports").update({ reporter_id: null }).eq("reporter_id", userId);

    // The remaining owned tables cascade off auth.users FK, but we do the
    // explicit deletes as belt-and-braces + to satisfy the RLS-scoped user
    // client for tables without ON DELETE CASCADE.
    for (const table of ["outfit_items"]) {
      const { data: outfits } = await supabase.from("saved_outfits").select("id").eq("user_id", userId);
      const ids = (outfits ?? []).map((o) => o.id);
      if (ids.length > 0) await supabaseAdmin.from(table).delete().in("outfit_id", ids);
    }
    for (const table of OWNED_TABLES) {
      if (table === "outfit_items") continue;
      if (table === "follows") {
        await supabaseAdmin.from("follows").delete().or(`follower_id.eq.${userId},followee_id.eq.${userId}`);
        continue;
      }
      if (table === "user_blocks") {
        await supabaseAdmin.from("user_blocks").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
        continue;
      }
      const col = table === "user_preferences" ? "user_id" : "user_id";
      await supabaseAdmin.from(table).delete().eq(col, userId);
    }
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // Finally: auth.users
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error(`Account row deleted, but auth user removal failed: ${delErr.message}`);

    return { ok: true };
  });
