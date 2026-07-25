import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";

export const Route = createFileRoute("/legal/location-weather")({
  head: () => ({
    meta: [
      { title: "Location & Weather Permission — DRIP" },
      { name: "description", content: "How DRIP uses location for weather." },
    ],
  }),
  component: L,
});

function L() {
  return (
    <>
      <LegalDraftBanner />
      <h1>Location & Weather Permission Notice</h1>
      <p>
        When you press <em>Use my location</em> in the outfit generator, your browser prompts
        you for a one-time geolocation permission. If you grant it:
      </p>
      <ul>
        <li>Your approximate coordinates are sent to Open-Meteo's public weather API to fetch
          today's forecast.</li>
        <li>The forecast is used to bias outfit suggestions (warmer layers when cold, lighter
          when hot).</li>
        <li>We do <strong>not</strong> store your precise coordinates in our database. Only the
          temperature and condition are attached to the resulting outfit.</li>
        <li>You can revoke browser location permission at any time from your browser settings.</li>
        <li>You can also enter the weather manually and skip location entirely.</li>
      </ul>
      <BetaFooterNote />
    </>
  );
}
