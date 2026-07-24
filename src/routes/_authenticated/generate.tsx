import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/generate")({
  head: () => ({
    meta: [
      { title: "Generate — DRIP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GeneratePage,
});

function GeneratePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Outfit generator</p>
        <h1 className="mt-1 font-display text-4xl">Generate a fit</h1>
      </div>
      <ComingSoon
        title="Phase 2 — Rule-based outfit engine"
        body="Tell DRIP where you're going, the vibe, weather, and dress code. It scores every valid combo from your closet on color harmony, silhouette balance, weather, formality, and taste."
      />
    </div>
  );
}

export function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <div className="card-surface p-6">
      <p className="text-xs uppercase tracking-widest text-primary">In build</p>
      <h2 className="mt-1 font-display text-2xl">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
