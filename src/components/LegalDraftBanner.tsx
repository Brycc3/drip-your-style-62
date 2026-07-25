import { isLegalReady, LEGAL_CONFIG } from "@/config/legal";

/**
 * Shown at the top of every /legal page until the owner completes
 * src/config/legal.ts and reviews the drafts with counsel.
 */
export function LegalDraftBanner() {
  if (isLegalReady()) return null;
  return (
    <div className="mb-6 rounded-lg border border-destructive/60 bg-destructive/10 p-4 text-sm">
      <p className="font-semibold text-destructive">
        Beta legal drafts — NOT attorney-reviewed.
      </p>
      <p className="mt-1 text-destructive/90">
        Placeholders like <code className="rounded bg-background/40 px-1">[LEGAL OWNER]</code>,
        <code className="ml-1 rounded bg-background/40 px-1">[SUPPORT EMAIL]</code>, and
        <code className="ml-1 rounded bg-background/40 px-1">[EFFECTIVE DATE]</code> must be
        filled in <code className="rounded bg-background/40 px-1">src/config/legal.ts</code> and
        the copy reviewed before public commercial launch. Owner: {LEGAL_CONFIG.LEGAL_OWNER}.
      </p>
    </div>
  );
}

export function BetaFooterNote() {
  return (
    <p className="mt-10 border-t border-border pt-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
      Beta legal drafts — review before public commercial launch.
    </p>
  );
}
