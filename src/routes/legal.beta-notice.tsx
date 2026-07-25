import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";
import { LEGAL_CONFIG } from "@/config/legal";

export const Route = createFileRoute("/legal/beta-notice")({
  head: () => ({
    meta: [
      { title: "Beta Notice & Support — DRIP" },
      { name: "description", content: "Beta scope and contact information." },
    ],
  }),
  component: B,
});

function B() {
  const c = LEGAL_CONFIG;
  return (
    <>
      <LegalDraftBanner />
      <h1>Beta Notice & Support</h1>
      <p>
        DRIP is in beta. That means:
      </p>
      <ul>
        <li>Features may break or be removed without notice.</li>
        <li>Data loss is possible. Export your data periodically.</li>
        <li>Selling, payments, shipping, and stranger-to-stranger messaging are disabled.</li>
        <li>All shop, news, and AI-adjacent content is labeled DEMO.</li>
        <li>The name "{c.APP_NAME}" is an internal beta identifier; trademark clearance is
          still pending and the brand may change before public launch.</li>
      </ul>

      <h2>Contact & support</h2>
      <p>Email: {c.SUPPORT_EMAIL}</p>
      <p>Operator: {c.LEGAL_OWNER} · {c.JURISDICTION}</p>
      <BetaFooterNote />
    </>
  );
}
