import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";
import { LEGAL_CONFIG } from "@/config/legal";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — DRIP" },
      { name: "description", content: "Terms for using the DRIP wardrobe app." },
    ],
  }),
  component: Terms,
});

function Terms() {
  const c = LEGAL_CONFIG;
  return (
    <>
      <LegalDraftBanner />
      <h1>Terms of Use</h1>
      <p><em>Effective date: {c.EFFECTIVE_DATE}. Governed by the laws of {c.JURISDICTION}.</em></p>

      <h2>1. Eligibility</h2>
      <p>You must be at least {c.MIN_AGE} to create an account.</p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for the accuracy of the information you add and for keeping your
        password secure. One person per account.
      </p>

      <h2>3. Your content</h2>
      <p>
        You keep ownership of everything you upload (photos, outfits, notes). By uploading
        content you grant {c.LEGAL_OWNER} a non-exclusive license to store, process, and
        display it to <em>you</em>. Content you set to public may be displayed to other users
        or visitors on your public profile.
      </p>

      <h2>4. Beta service</h2>
      <p>
        DRIP is in beta. Features can change, break, or be removed. Data may be lost during
        beta and no warranty is provided. Selling, payments, shipping, and stranger messaging
        are disabled in beta.
      </p>

      <h2>5. Shopping recommendations</h2>
      <p>
        Recommendations are algorithmic and educational. Prices, availability, and product
        details are from a demo catalog and are not live retail data. See the Affiliate &
        Shopping Disclosure.
      </p>

      <h2>6. Prohibited use</h2>
      <p>See the Acceptable Use policy. Violations may result in content removal or account
        suspension.</p>

      <h2>7. Termination</h2>
      <p>
        You can delete your account any time from Profile → Privacy & Data. We can suspend
        or terminate accounts that violate these terms.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The service is provided "as is". To the extent permitted by law, {c.LEGAL_OWNER}
        disclaims all warranties and is not liable for indirect or consequential damages.
      </p>

      <h2>9. Contact</h2>
      <p>{c.SUPPORT_EMAIL}</p>
      <BetaFooterNote />
    </>
  );
}
