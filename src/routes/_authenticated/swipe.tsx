import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "./generate";

export const Route = createFileRoute("/_authenticated/swipe")({
  head: () => ({
    meta: [
      { title: "Swipe — DRIP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Train your taste</p>
        <h1 className="mt-1 font-display text-4xl">Swipe</h1>
      </div>
      <ComingSoon
        title="Phase 3 — Swipe to teach the ranker"
        body="Swipe right on outfits you'd wear, left on ones you wouldn't. Feedback goes straight into your recommender."
      />
    </div>
  ),
});
