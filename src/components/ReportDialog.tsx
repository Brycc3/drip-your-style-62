import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Flag, X } from "lucide-react";
import { fileReport } from "@/lib/reports.functions";

export const REPORT_REASONS = [
  { v: "harassment", l: "Harassment or bullying" },
  { v: "hate", l: "Hate or discrimination" },
  { v: "sexual", l: "Sexual or inappropriate content" },
  { v: "impersonation", l: "Impersonation" },
  { v: "spam", l: "Spam or scam" },
  { v: "copyright", l: "Copyright / IP" },
  { v: "privacy", l: "Privacy violation" },
  { v: "other", l: "Other" },
] as const;

type Props = {
  targetType: "outfit" | "user" | "comment" | "shop_item" | "broken_link" | "other";
  targetId?: string;
  open: boolean;
  onClose: () => void;
};

export function ReportDialog({ targetType, targetId, open, onClose }: Props) {
  const submit = useServerFn(fileReport);
  const [reason, setReason] = useState<string>("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function go() {
    setBusy(true);
    try {
      await submit({ data: { target_type: targetType, target_id: targetId, reason, details: details.trim() || undefined } });
      toast.success("Report submitted. Our team will review it.");
      onClose();
      setDetails("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <Flag className="h-3.5 w-3.5" /> Report
          </p>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Reports are reviewed by DRIP moderators. False reports may result in action against your account.
        </p>
        <div className="mt-4 space-y-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="reason" value={r.v} checked={reason === r.v} onChange={() => setReason(r.v)} className="accent-primary" />
              {r.l}
            </label>
          ))}
        </div>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Optional details"
          className="mt-3 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest">Cancel</button>
          <button onClick={go} disabled={busy} className="btn-lime flex-1 !py-2 text-xs disabled:opacity-50">
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
