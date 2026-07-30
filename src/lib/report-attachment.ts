/**
 * Pure helpers for the optional problem-report screenshot attachment.
 * The Storage bucket is `reports` (private) and objects are namespaced
 * under `<user_id>/<report_id>/<attachment_id>.<ext>` so the RLS policies can
 * gate ownership and each object is tied to exactly one report.
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

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function attachmentPath(
  userId: string,
  reportId: string,
  extension: string,
  attachmentId: string,
): string {
  if (![userId, reportId, attachmentId].every((value) => UUID_PATTERN.test(value))) {
    throw new Error("Report attachment identifiers must be UUIDs");
  }
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!["png", "jpg", "webp", "gif"].includes(safeExtension)) {
    throw new Error("Unsupported report attachment extension");
  }
  return `${userId}/${reportId}/${attachmentId}.${safeExtension}`;
}

export function screenshotIsApproved(fileSelected: boolean, approved: boolean): boolean {
  return fileSelected && approved;
}

export function problemReportType(targetType: string, reason: string): string {
  const match = /^problem:(bug|other):/i.exec(reason);
  return targetType === "other" && match ? match[1].toLowerCase() : targetType;
}

/**
 * Build a safe, whitelisted metadata payload for a problem report. Never
 * includes tokens, form values, closet images, console output, or any
 * ambient app state — only what was explicitly provided by the caller.
 */
export type ProblemReportMeta = {
  report_type: "bug" | "other";
  description: string;
  route?: string;
  user_agent?: string;
  device?: string;
  client_timestamp?: string;
  attachment_path?: string;
};

export function buildProblemReportDetails(input: ProblemReportMeta): string {
  return [
    `REPORT_TYPE: ${input.report_type}`,
    input.route ? `ROUTE: ${input.route}` : null,
    input.client_timestamp ? `CLIENT_TS: ${input.client_timestamp}` : null,
    input.device ? `DEVICE: ${input.device}` : null,
    input.user_agent ? `UA: ${input.user_agent}` : null,
    "",
    input.description,
  ]
    .filter((value) => value !== null)
    .join("\n");
}

export function buildSafeReportMeta(input: ProblemReportMeta): ProblemReportMeta {
  const clip = (s: string | undefined, n: number) => (s === undefined ? undefined : s.slice(0, n));
  const asHttpPath = (s: string | undefined) => {
    if (!s) return undefined;
    // Only same-origin paths — never full URLs with query strings that could
    // leak tokens (e.g. #access_token=... from OAuth callbacks).
    if (!s.startsWith("/")) return "/";
    return s.split("#")[0].split("?")[0].slice(0, 500);
  };
  return {
    report_type: input.report_type === "bug" ? "bug" : "other",
    description: clip(input.description, 4000) ?? "",
    route: asHttpPath(input.route),
    user_agent: clip(input.user_agent, 500),
    device: clip(input.device, 120),
    client_timestamp: clip(input.client_timestamp, 40),
    attachment_path: clip(input.attachment_path, 500),
  };
}
