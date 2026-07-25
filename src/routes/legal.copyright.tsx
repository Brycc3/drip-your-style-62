import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";
import { LEGAL_CONFIG } from "@/config/legal";

export const Route = createFileRoute("/legal/copyright")({
  head: () => ({
    meta: [
      { title: "Copyright / Image Takedown — DRIP" },
      { name: "description", content: "How to report infringing content on DRIP." },
    ],
  }),
  component: CR,
});

function CR() {
  const c = LEGAL_CONFIG;
  return (
    <>
      <LegalDraftBanner />
      <h1>Copyright / Image Takedown</h1>
      <p>
        If you believe content posted on DRIP infringes your copyright or right of publicity,
        email {c.SUPPORT_EMAIL} with:
      </p>
      <ul>
        <li>The URL of the content on DRIP.</li>
        <li>A description of the work you claim was infringed.</li>
        <li>Your contact information.</li>
        <li>A statement, under penalty of perjury, that the information is accurate and that
          you are authorized to act.</li>
        <li>Your electronic or physical signature.</li>
      </ul>
      <p>
        We will review and, when appropriate, remove the content and notify the poster. Repeat
        infringers will have their accounts terminated.
      </p>
      <p>
        Counter-notices may be sent to the same address. We follow the notice-and-takedown
        framework applicable in {c.JURISDICTION}.
      </p>
      <BetaFooterNote />
    </>
  );
}
