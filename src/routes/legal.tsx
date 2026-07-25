import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal & Safety Center — DRIP" },
      {
        name: "description",
        content:
          "DRIP's Legal & Safety Center: privacy, terms, community guidelines, deletion, and safety notices.",
      },
      { property: "og:title", content: "Legal & Safety Center — DRIP" },
      {
        property: "og:description",
        content: "Privacy, terms, safety, and data controls for the DRIP wardrobe app.",
      },
    ],
  }),
  component: LegalLayout,
});

const LINKS = [
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/terms", label: "Terms of Use" },
  { to: "/legal/community-guidelines", label: "Community Guidelines" },
  { to: "/legal/acceptable-use", label: "Acceptable Use" },
  { to: "/legal/account-deletion", label: "Account & Data Deletion" },
  { to: "/legal/copyright", label: "Copyright / Takedown" },
  { to: "/legal/affiliate-disclosure", label: "Affiliate & Shopping" },
  { to: "/legal/location-weather", label: "Location & Weather" },
  { to: "/legal/ai-image-processing", label: "AI & Image Processing" },
  { to: "/legal/beta-notice", label: "Beta Notice & Support" },
] as const;

function LegalLayout() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="safe-t border-b border-border">
        <div className="container-app flex h-16 items-center justify-between">
          <Link to="/" className="font-display text-2xl tracking-widest">
            DRIP<span className="text-primary">.</span>
          </Link>
          <Link
            to="/legal"
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Legal Center
          </Link>
        </div>
      </header>
      <div className="container-app grid gap-8 py-8 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-4 md:self-start">
          <p className="mb-3 text-xs uppercase tracking-widest text-primary">Legal & Safety</p>
          <nav className="flex flex-col gap-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md px-3 py-2 text-foreground/80 hover:bg-surface hover:text-foreground [&.active]:bg-surface [&.active]:text-primary"
                activeProps={{ className: "active" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 prose prose-invert max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h1:text-4xl prose-h2:text-2xl prose-h2:mt-8 prose-a:text-primary">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
