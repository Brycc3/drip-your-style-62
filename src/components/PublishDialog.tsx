import { useState } from "react";
import { X, Globe } from "lucide-react";

type Values = { caption: string; vibe: string; occasion: string; comments_enabled: boolean };

type Props = {
  open: boolean;
  initial: Values;
  onCancel: () => void;
  onConfirm: (v: Values) => Promise<void>;
};

export function PublishDialog({ open, initial, onCancel, onConfirm }: Props) {
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function go() {
    setBusy(true);
    try { await onConfirm(v); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <Globe className="h-3.5 w-3.5" /> Publish outfit
          </p>
          <button onClick={onCancel} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
          Only this outfit — its caption, vibe/occasion, explanation, and the item photos already
          attached to it — becomes public. The rest of your closet, your private notes, prices,
          storage, and email stay private.
        </div>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Caption</span>
            <input value={v.caption} onChange={(e) => setV({ ...v, caption: e.target.value })} maxLength={80} className={inp} placeholder="Untitled look" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Vibe</span>
              <input value={v.vibe} onChange={(e) => setV({ ...v, vibe: e.target.value })} maxLength={40} className={inp} />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Occasion</span>
              <input value={v.occasion} onChange={(e) => setV({ ...v, occasion: e.target.value })} maxLength={40} className={inp} />
            </label>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm">Allow comments</span>
            <input type="checkbox" checked={v.comments_enabled} onChange={(e) => setV({ ...v, comments_enabled: e.target.checked })} className="h-5 w-5 accent-primary" />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest">Cancel</button>
          <button onClick={go} disabled={busy} className="btn-lime flex-1 !py-2 text-xs disabled:opacity-50">
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:border-primary text-sm";
