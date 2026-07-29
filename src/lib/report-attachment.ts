/**
 * Pure helpers for the optional problem-report screenshot attachment.
 * The Storage bucket is `reports` (private) and objects are namespaced
 * under `reports/<user_id>/<uuid>.<ext>` so the RLS policies can gate on
 * the first path segment.
 */

export const REPORT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const REPORT_ALLOWED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type AttachmentValidation =
  | { ok: true; extension: "png" | "jpg" | "webp" | "gif" }
  | { ok: false; error: string };

export function validateAttachment(file: {
  type: string;
  size: number;
  name: string;
}): AttachmentValidation {
  if (!REPORT_ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      error: "Attach a PNG, JPG, WebP, or GIF image.",
    };
  }
  if (file.size <= 0) return { ok: false, error: "File appears empty." };
  if (file.size > REPORT_MAX_BYTES) {
    return { ok: false, error: "Image is too large (5 MB max)." };
  }
  const ext: AttachmentValidation & { ok: true } extends never
    ? never
    : "png" | "jpg" | "webp" | "gif" =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  return { ok: true, extension: ext };
}

export function attachmentPath(userId: string, extension: string, uuid: string): string {
  return `${userId}/${uuid}.${extension.replace(/[^a-z0-9]/gi, "")}`;
}

/**
 * Build a safe, whitelisted metadata payload for a problem report. Never
 * includes tokens, form values, closet images, console output, or any
 * ambient app state — only what was explicitly provided by the caller.
 */
export type ProblemReportMeta = {
  area: string;
  summary: string;
  details?: string;
  path?: string;
  user_agent?: string;
  screen?: string;
  app_version?: string;
  client_timestamp?: string;
  attachment_path?: string;
};

export function buildSafeReportMeta(input: ProblemReportMeta): ProblemReportMeta {
  const clip = (s: string | undefined, n: number) =>
    s === undefined ? undefined : s.slice(0, n);
  const asHttpPath = (s: string | undefined) => {
    if (!s) return undefined;
    // Only same-origin paths — never full URLs with query strings that could
    // leak tokens (e.g. #access_token=... from OAuth callbacks).
    if (!s.startsWith("/")) return "/";
    return s.split("#")[0].split("?")[0].slice(0, 500);
  };
  return {
    area: clip(input.area, 40) ?? "other",
    summary: clip(input.summary, 200) ?? "",
    details: clip(input.details, 4000),
    path: asHttpPath(input.path),
    user_agent: clip(input.user_agent, 500),
    screen: clip(input.screen, 80),
    app_version: clip(input.app_version, 80),
    client_timestamp: clip(input.client_timestamp, 40),
    attachment_path: clip(input.attachment_path, 500),
  };
}
