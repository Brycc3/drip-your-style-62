import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  area: z.enum([
    "closet",
    "generate",
    "shop",
    "feed",
    "profile",
    "auth",
    "onboarding",
    "swipe",
    "inspo",
    "other",
  ]),
  summary: z.string().min(4).max(200),
  details: z.string().max(4000).optional(),
  path: z.string().max(500).optional(),
  user_agent: z.string().max(500).optional(),
  screen: z.string().max(80).optional(),
  app_version: z.string().max(80).optional(),
  client_timestamp: z.string().max(40).optional(),
  attachment_path: z
    .string()
    .max(500)
    .regex(
      /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpe?g|webp|gif)$/i,
      "Invalid attachment path",
    )
    .optional(),
});

export const reportProblem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => problemInput.parse(i))
  .handler(async ({ context, data }) => {
    // If an attachment_path was supplied it MUST live under the caller's
    // own folder — reject anything else even if the client claims otherwise.
    if (data.attachment_path && !data.attachment_path.startsWith(`${context.userId}/`)) {
      throw new Error("Attachment must belong to the caller");
    }
    const details = [
      `AREA: ${data.area}`,
      data.path ? `PATH: ${data.path}` : null,
      data.screen ? `SCREEN: ${data.screen}` : null,
      data.app_version ? `VERSION: ${data.app_version}` : null,
      data.client_timestamp ? `CLIENT_TS: ${data.client_timestamp}` : null,
      data.user_agent ? `UA: ${data.user_agent}` : null,
      "",
      data.details ?? "",
    ]
      .filter((x) => x !== null)
      .join("\n");
    const { error } = await context.supabase.from("content_reports").insert({
      reporter_id: context.userId,
      target_type: "other",
      target_id: null,
      reason: `problem:${data.area}: ${data.summary}`.slice(0, 200),
      details: details.slice(0, 2000),
      attachment_path: data.attachment_path ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
