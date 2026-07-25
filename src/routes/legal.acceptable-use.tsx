import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";

export const Route = createFileRoute("/legal/acceptable-use")({
  head: () => ({
    meta: [
      { title: "Acceptable Use — DRIP" },
      { name: "description", content: "Content and behavior prohibited on DRIP." },
    ],
  }),
  component: AU,
});

function AU() {
  return (
    <>
      <LegalDraftBanner />
      <h1>Acceptable Use / Prohibited Content</h1>
      <p>You may not upload, post, or transmit:</p>
      <ul>
        <li>Sexually explicit content, nudity, or sexualized imagery of any person.</li>
        <li>Any content involving minors in a sexual, exploitative, or unsafe context.</li>
        <li>Violence, self-harm promotion, or content celebrating harm to others.</li>
        <li>Hateful content targeting people based on race, ethnicity, religion, gender,
          sexual orientation, disability, or similar protected characteristics.</li>
        <li>Harassment, threats, doxxing, or non-consensual intimate imagery.</li>
        <li>Content that infringes copyright, trademark, or right of publicity.</li>
        <li>Malware, phishing, or attempts to circumvent security.</li>
        <li>Automated scraping, mass extraction, or reverse engineering of the service.</li>
        <li>Content that misrepresents you as another person or brand.</li>
        <li>Illegal goods, weapons sales, or regulated substances.</li>
      </ul>
      <p>
        Violations may result in immediate removal and account suspension. Reports of illegal
        content will be handled per applicable law.
      </p>
      <BetaFooterNote />
    </>
  );
}
