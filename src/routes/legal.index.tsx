import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";

export const Route = createFileRoute("/legal/")({
  head: () => ({
    meta: [
      { title: "Legal & Safety Center — DRIP" },
      {
        name: "description",
        content: "Overview of DRIP's privacy, terms, and safety policies.",
      },
    ],
  }),
  component: LegalIndex,
});

const SECTIONS = [
  ["/legal/privacy", "Privacy Policy", "What we collect, why, and how it's protected."],
  ["/legal/terms", "Terms of Use", "Rules for using DRIP."],
  ["/legal/community-guidelines", "Community Guidelines", "How to show up in public posts."],
  ["/legal/acceptable-use", "Acceptable Use", "What content is prohibited."],
  ["/legal/account-deletion", "Account & Data Deletion", "Export or delete your account."],
  ["/legal/copyright", "Copyright / Image Takedown", "How to report infringing content."],
  ["/legal/affiliate-disclosure", "Affiliate & Shopping Disclosure", "How shopping links work."],
  ["/legal/location-weather", "Location & Weather Permission", "What location data does."],
  ["/legal/ai-image-processing", "AI & Image Processing Notice", "What is (and isn't) AI here."],
  ["/legal/beta-notice", "Beta Notice & Support", "Beta scope and how to contact us."],
] as const;

function LegalIndex() {
  return (
    <>
      <LegalDraftBanner />
      <h1>Legal & Safety Center</h1>
      <p>
        DRIP is a private wardrobe and outfit tool in beta. Below are the policies covering
        how we handle your data, what you can post, and how to reach us.
      </p>
      <div className="not-prose mt-6 grid gap-3">
        {SECTIONS.map(([to, title, desc]) => (
          <Link
            key={to}
            to={to}
            className="card-surface block p-4 transition-colors hover:border-primary/60"
          >
            <p className="font-display text-lg">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </Link>
        ))}
      </div>
      <BetaFooterNote />
    </>
  );
}
