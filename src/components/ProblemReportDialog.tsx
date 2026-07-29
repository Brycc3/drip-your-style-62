import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LifeBuoy, X } from "lucide-react";
import { reportProblem } from "@/lib/reports.functions";

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
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function go() {
    if (summary.trim().length < 4) return toast.error("Give a short summary (4+ chars).");
    setBusy(true);
    try {
      await submit({
        data: {
          area,
          summary: summary.trim(),
          details: details.trim() || undefined,
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          screen:
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : undefined,
        },
      });
      toast.success("Thanks — problem logged.");
      setSummary("");
      setDetails("");
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
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5"
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
          Tell us what broke. Your path, screen size, and browser are attached automatically.
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
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy}
            className="btn-lime flex-1 !py-2 text-xs disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
