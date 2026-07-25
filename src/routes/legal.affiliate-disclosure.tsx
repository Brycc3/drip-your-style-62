import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";

export const Route = createFileRoute("/legal/affiliate-disclosure")({
  head: () => ({
    meta: [
      { title: "Affiliate & Shopping Disclosure — DRIP" },
      { name: "description", content: "How DRIP shopping recommendations work." },
    ],
  }),
  component: A,
});

function A() {
  return (
    <>
      <LegalDraftBanner />
      <h1>Affiliate & Shopping Disclosure</h1>
      <p>
        The current DRIP shop is a <strong>demo catalog</strong> used to test recommendation
        behavior. It is not a live retailer feed.
      </p>
      <ul>
        <li>Every demo card is labeled <strong>DEMO</strong>.</li>
        <li>Prices, availability, brands, and descriptions are illustrative.</li>
        <li>Most cards show <em>View sample</em> because no verified retailer URL exists.</li>
        <li><em>Shop now</em> only appears when a verified external URL is present.</li>
        <li>We do not currently earn affiliate commissions in beta.</li>
        <li>If and when live retailer links or affiliate programs are added, this page will
          be updated to disclose exactly which retailers are involved and whether we earn a
          commission on referred sales.</li>
      </ul>
      <p>
        You can flag a broken or misleading link with <em>Report broken link</em> on any
        product card.
      </p>
      <BetaFooterNote />
    </>
  );
}
