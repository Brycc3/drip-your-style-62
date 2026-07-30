import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildProblemReportDetails } from "./report-attachment";

const reportInput = z.object({
  target_type: z.enum(["outfit", "user", "comment", "shop_item", "broken_link", "other"]),
  target_id: z.string().max(200).optional(),
  reason: z.string().min(2).max(200),
  details: z.string().max(2000).optional(),
});

export const fileReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => reportInput.parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("content_reports").insert({
      reporter_id: context.userId,
      target_type: data.target_type,
      target_id: data.target_id ?? null,
      reason: data.reason,
      details: data.details ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const blockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ blocked_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("user_blocks").insert({
      blocker_id: context.userId,
      blocked_id: data.blocked_id,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

const problemInput = z.object({
  report_type: z.enum(["bug", "other"]),
  description: z.string().trim().min(4).max(4000),
  route: z.string().max(500).optional(),
  user_agent: z.string().max(500).optional(),
  device: z.string().max(120).optional(),
  client_timestamp: z.string().max(40).optional(),
});

const attachmentInput = z.object({
  report_id: z.string().uuid(),
  attachment_path: z
    .string()
    .max(500)
    .regex(
      /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/i,
      "Invalid attachment path",
    ),
});

export const createProblemReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => problemInput.parse(i))
  .handler(async ({ context, data }) => {
    const details = buildProblemReportDetails(data);
    const { data: inserted, error } = await context.supabase
      .from("content_reports")
      .insert({
        reporter_id: context.userId,
        // `target_type` identifies the reported entity and its database check
        // constraint intentionally has no `bug` value. Keep problem reports in
        // the existing `other` target bucket and store their user-selected type
        // in the reason/details for moderation.
        target_type: "other",
        target_id: null,
        reason: `problem:${data.report_type}: ${data.description}`.slice(0, 200),
        // Preserve the complete accepted description. `details` is a text
        // column and must not truncate a valid 4,000-character report.
        details,
        attachment_path: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, report_id: inserted.id };
  });

export const attachProblemScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => attachmentInput.parse(i))
  .handler(async ({ context, data }) => {
    if (!data.attachment_path.startsWith(`${context.userId}/${data.report_id}/`)) {
      throw new Error("Attachment must belong to this report");
    }
    const { error } = await context.supabase.rpc("attach_problem_report_screenshot", {
      _report: data.report_id,
      _path: data.attachment_path,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
