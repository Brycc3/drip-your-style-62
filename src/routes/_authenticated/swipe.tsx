import { createFileRoute, Link } from "@tanstack/react-router";

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
      <div className="card-surface p-6">
        <p className="text-xs uppercase tracking-widest text-primary">Coming in Phase 3</p>
        <h2 className="mt-1 font-display text-2xl">Swipe to teach the ranker</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Swipe right on outfits you'd wear, left on ones you wouldn't. Feedback feeds the generator.
        </p>
        <Link to="/feed" className="btn-lime mt-4 inline-flex">See the community feed</Link>
      </div>
    </div>
  ),
});
