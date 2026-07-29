import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/**
 * Pass 2 moderation server functions. Every admin function delegates the
 * actual write to a SECURITY DEFINER SQL routine whose first statement is
 * `is_admin(auth.uid())`, so the privilege check lives in the DB as well.
 */

type AuthedSupabase = SupabaseClient<Database>;

async function assertAdmin(supabase: AuthedSupabase, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _uid: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin only");
}


export const blockAndUnfollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ blocked_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    if (data.blocked_id === context.userId) throw new Error("Cannot block yourself");
    const { error } = await context.supabase.rpc("block_and_unfollow", {
      _blocked: data.blocked_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unblockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ blocked_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", context.userId)
      .eq("blocked_id", data.blocked_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const modNote = z.string().max(500).optional();

export const adminListOpenReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ status: z.enum(["open", "reviewed", "dismissed", "actioned", "all"]).optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ context, data }) => {
    // Reading content_reports is already admin-only via RLS; still assert so
    // non-admins get a clear error instead of an empty list.
    await assertAdmin(context.supabase, context.userId);
    const q = context.supabase
      .from("content_reports")
      .select(
        "id, reporter_id, target_type, target_id, reason, details, status, created_at, reviewed_at, reviewed_by, resolution_note",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    const { data: rows, error } = data.status && data.status !== "all"
      ? await q.eq("status", data.status)
      : await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminHideOutfit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ outfit_id: z.string().uuid(), note: modNote }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("admin_hide_outfit", {
      _outfit: data.outfit_id,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ comment_id: z.string().uuid(), note: modNote }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("admin_delete_comment", {
      _comment: data.comment_id,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ target_id: z.string().uuid(), suspend: z.boolean(), note: modNote })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("admin_set_suspension", {
      _target: data.target_id,
      _suspend: data.suspend,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        report_id: z.string().uuid(),
        status: z.enum(["open", "reviewed", "dismissed", "actioned"]),
        note: modNote,
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("admin_update_report", {
      _report: data.report_id,
      _status: data.status,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
