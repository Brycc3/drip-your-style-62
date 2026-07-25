import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";

export const Route = createFileRoute("/legal/community-guidelines")({
  head: () => ({
    meta: [
      { title: "Community Guidelines — DRIP" },
      { name: "description", content: "How to behave on public DRIP surfaces." },
    ],
  }),
  component: CG,
});

function CG() {
  return (
    <>
      <LegalDraftBanner />
      <h1>Community Guidelines</h1>
      <p>DRIP is a personal wardrobe tool first, a social space second. When you post publicly:</p>
      <ul>
        <li>Show your own outfits and fits. Don't impersonate other people or brands.</li>
        <li>Be respectful in comments. Style critique is fine; harassment is not.</li>
        <li>Don't post identifying information about anyone else without consent.</li>
        <li>Don't post nudity, sexual content, gore, hate, or content targeting minors.</li>
        <li>Don't spam, scam, or solicit purchases outside the app.</li>
        <li>Use the Report button to flag content that breaks these rules.</li>
      </ul>
      <p>
        Enforcement is at our discretion. We may remove content, restrict features, or
        suspend accounts.
      </p>
      <BetaFooterNote />
    </>
  );
}
