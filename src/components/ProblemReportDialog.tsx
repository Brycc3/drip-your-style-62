import { useRef, useState } from "react";
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
  validateAttachment,
} from "@/lib/report-attachment";

const AREAS = [
  { v: "closet", l: "Closet" },
  { v: "generate", l: "Generate" },
  { v: "shop", l: "Shop" },
  { v: "feed", l: "Feed" },
  { v: "swipe", l: "Swipe / Taste" },
  { v: "inspo", l: "Inspo Builder" },
  { v: "profile", l: "Profile" },
  { v: "onboarding", l: "Onboarding" },
  { v: "auth", l: "Sign in / Sign up" },
  { v: "other", l: "Something else" },
] as const;

type Area = (typeof AREAS)[number]["v"];

export function ProblemReportDialog({
  open,
  onClose,
  defaultArea = "other",
}: {
  open: boolean;
  onClose: () => void;
  defaultArea?: Area;
}) {
  const submit = useServerFn(reportProblem);
  const [area, setArea] = useState<Area>(defaultArea);
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  if (!open) return null;

  async function uploadAttachment(): Promise<string | undefined> {
    if (!file) return undefined;
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
        toast.error("Sign in to attach a screenshot.");
        return undefined;
      }
      const uuid = crypto.randomUUID();
      const path = attachmentPath(uid, v.extension, uuid);
      const { error } = await supabase.storage.from("reports").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        toast.error(error.message);
        return undefined;
      }
      return path;
    } finally {
      setUploading(false);
    }
  }

  async function go() {
    if (summary.trim().length < 4) return toast.error("Give a short summary (4+ chars).");
    setBusy(true);
    try {
      const attachment_path = await uploadAttachment();
      const meta = buildSafeReportMeta({
        area,
        summary: summary.trim(),
        details: details.trim() || undefined,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        screen:
          typeof window !== "undefined"
            ? `${window.innerWidth}x${window.innerHeight}`
            : undefined,
        client_timestamp: new Date().toISOString(),
        attachment_path,
      });
      await submit({
        data: {
          area: meta.area as Area,
          summary: meta.summary,
          details: meta.details,
          path: meta.path,
          user_agent: meta.user_agent,
          screen: meta.screen,
          client_timestamp: meta.client_timestamp,
          attachment_path: meta.attachment_path,
        },
      });
      toast.success("Thanks — problem logged.");
      setSummary("");
      setDetails("");
      setFile(null);
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
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <LifeBuoy className="h-3.5 w-3.5" /> Report a problem
          </p>
          <button onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Only what you type here plus the current path, screen size, browser string, and
          timestamp is sent. We never auto-capture the screen or read your form fields.
        </p>
        <label className="mt-4 block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Area</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as Area)}
            className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {AREAS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.l}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Summary
          </span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={200}
            placeholder="e.g. Shop images not loading on iPhone"
            className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            What happened (optional)
          </span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={4000}
            rows={4}
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
            }}
          />
          {file ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
              <span className="truncate">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="inline-flex items-center gap-1 text-destructive"
              >
                <Trash2 className="h-3 w-3" /> Remove
              </button>
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
            PNG · JPG · WebP · GIF up to {Math.round(REPORT_MAX_BYTES / (1024 * 1024))} MB.
            Uploaded to your private report folder.
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy || uploading}
            className="btn-lime flex-1 !py-2 text-xs disabled:opacity-50"
          >
            {busy || uploading ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
