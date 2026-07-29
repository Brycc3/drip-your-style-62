import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LifeBuoy, X, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reportProblem } from "@/lib/reports.functions";
import {
  REPORT_ALLOWED_MIME,
  REPORT_MAX_BYTES,
  attachmentPath,
  buildSafeReportMeta,
  screenshotIsApproved,
  validateAttachment,
} from "@/lib/report-attachment";

export function ProblemReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const submit = useServerFn(reportProblem);
  const [reportType, setReportType] = useState<"bug" | "other">("bug");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [screenshotApproved, setScreenshotApproved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open) return null;

  function closeAndReset() {
    setDescription("");
    setFile(null);
    setScreenshotApproved(false);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  async function uploadAttachment(reportId: string): Promise<string | undefined> {
    if (!file || !screenshotIsApproved(Boolean(file), screenshotApproved)) return undefined;
    const v = validateAttachment({ type: file.type, size: file.size, name: file.name });
    if (!v.ok) {
      toast.error(v.error);
      return undefined;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        throw new Error("Sign in to attach a screenshot.");
      }
      const attachmentId = crypto.randomUUID();
      const path = attachmentPath(uid, reportId, v.extension, attachmentId);
      const { error } = await supabase.storage.from("reports").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        throw new Error(error.message);
      }
      return path;
    } finally {
      setUploading(false);
    }
  }

  async function go() {
    if (description.trim().length < 4) {
      return toast.error("Describe the problem in at least 4 characters.");
    }
    if (file && !screenshotApproved) {
      return toast.error("Approve the selected screenshot or remove it before sending.");
    }
    setBusy(true);
    try {
      const report_id = crypto.randomUUID();
      const attachment_path = await uploadAttachment(report_id);
      const meta = buildSafeReportMeta({
        report_type: reportType,
        description: description.trim(),
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        device:
          typeof window !== "undefined"
            ? `${window.innerWidth}x${window.innerHeight}; ${navigator.platform || "unknown platform"}`
            : undefined,
        client_timestamp: new Date().toISOString(),
        attachment_path,
      });
      await submit({
        data: {
          report_id,
          report_type: meta.report_type,
          description: meta.description,
          route: meta.route,
          user_agent: meta.user_agent,
          device: meta.device,
          client_timestamp: meta.client_timestamp,
          attachment_path: meta.attachment_path,
        },
      });
      toast.success("Thanks — problem logged.");
      setDescription("");
      setFile(null);
      setScreenshotApproved(false);
      if (fileRef.current) fileRef.current.value = "";
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={closeAndReset}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <LifeBuoy className="h-3.5 w-3.5" /> Report a problem
          </p>
          <button onClick={closeAndReset} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Only your description, report type, current route, timestamp, and basic browser/device
          metadata are sent. We never collect closet images, form contents, tokens, auth data, or
          console logs. A screenshot is included only if you select and approve one.
        </p>
        <label className="mt-4 block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Report type
          </span>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as "bug" | "other")}
            className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="bug">Bug</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="What happened, and what did you expect?"
            className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Screenshot (optional)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={Array.from(REPORT_ALLOWED_MIME).join(",")}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (!f) return setFile(null);
              const v = validateAttachment({ type: f.type, size: f.size, name: f.name });
              if (!v.ok) {
                toast.error(v.error);
                if (fileRef.current) fileRef.current.value = "";
                return;
              }
              setFile(f);
              setScreenshotApproved(false);
            }}
          />
          {file ? (
            <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3 text-xs">
              <div className="flex items-center gap-3">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Selected screenshot preview"
                    className="h-16 w-16 rounded-md object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setScreenshotApproved(false);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="inline-flex items-center gap-1 text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-foreground/85">
                <input
                  type="checkbox"
                  checked={screenshotApproved}
                  onChange={(event) => setScreenshotApproved(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                I approve uploading this screenshot with this report.
              </label>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-surface-2"
            >
              <ImagePlus className="h-3.5 w-3.5" /> Attach screenshot
            </button>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            PNG · JPG · WebP · GIF up to {Math.round(REPORT_MAX_BYTES / (1024 * 1024))} MB. Uploaded
            privately under this report only after you approve it.
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={closeAndReset}
            className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy || uploading || Boolean(file && !screenshotApproved)}
            className="btn-lime flex-1 !py-2 text-xs disabled:opacity-50"
          >
            {busy || uploading
              ? "Sending…"
              : file && !screenshotApproved
                ? "Approve screenshot"
                : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
