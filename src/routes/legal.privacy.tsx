import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";
import { LEGAL_CONFIG } from "@/config/legal";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — DRIP" },
      { name: "description", content: "How DRIP collects and protects your data." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  const c = LEGAL_CONFIG;
  return (
    <>
      <LegalDraftBanner />
      <h1>Privacy Policy</h1>
      <p>
        <em>Effective date: {c.EFFECTIVE_DATE}. Operated by {c.LEGAL_OWNER} ({c.JURISDICTION}).</em>
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account:</strong> email address, display name, optional handle and bio.</li>
        <li><strong>Closet:</strong> the clothing, shoes, accessories, and fragrances you add,
          including photos, brands, colors, sizes, prices, and notes.</li>
        <li><strong>Outfits & feedback:</strong> outfits you save, mark worn, like, save, pass,
          or comment on.</li>
        <li><strong>Preferences:</strong> selected vibes, colors, sizes, and topic follows.</li>
        <li><strong>Full-fit photos & outfit logs:</strong> images you upload for Fit Scan, plus
          date, optional occasion, weather, notes, and rating.</li>
        <li><strong>Location & weather:</strong> approximate coordinates you grant one-time to
          fetch the local forecast (see Location notice).</li>
        <li><strong>Device & session:</strong> browser, IP for security, and basic error logs.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>
        Your data is used only to run the app: showing your closet, generating outfits,
        ranking shop recommendations, personalizing news, and tracking wear history.
        We do not sell personal data.
      </p>

      <h2>3. Who can see your data</h2>
      <ul>
        <li>Only you can see your closet, saved outfits, fit-scan photos, feedback, and
          preferences.</li>
        <li>Outfits are <strong>private by default</strong>. You can flip an individual outfit
          to public; only then does it appear on your public profile page.</li>
        <li>Photos are stored in a private storage bucket and served via short-lived signed
          URLs to the owner only.</li>
      </ul>

      <h2>4. Third-party services</h2>
      <ul>
        <li>Authentication and database hosting are provided by Supabase.</li>
        <li>Weather is fetched from Open-Meteo when you request it.</li>
        <li>No advertising, no analytics tracking pixels are enabled in the beta.</li>
      </ul>

      <h2>5. Retention & deletion</h2>
      <p>
        Data is retained until you delete it. From Profile → Privacy & Data you can export
        your data as JSON or delete your account, which removes all rows you own and every
        image in your storage folder.
      </p>

      <h2>6. Age</h2>
      <p>
        DRIP is not directed to children under {c.MIN_AGE}. If you are under {c.MIN_AGE},
        do not use this service.
      </p>

      <h2>7. Changes</h2>
      <p>
        We will post material changes here and update the effective date. Continued use after
        a change means acceptance.
      </p>

      <h2>8. Contact</h2>
      <p>Questions: {c.SUPPORT_EMAIL}.</p>
      <BetaFooterNote />
    </>
  );
}
