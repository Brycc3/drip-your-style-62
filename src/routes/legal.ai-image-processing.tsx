import { createFileRoute } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";

export const Route = createFileRoute("/legal/ai-image-processing")({
  head: () => ({
    meta: [
      { title: "AI & Image Processing Notice — DRIP" },
      { name: "description", content: "What is and isn't AI in DRIP." },
    ],
  }),
  component: AI,
});

function AI() {
  return (
    <>
      <LegalDraftBanner />
      <h1>AI & Image Processing Notice</h1>

      <h2>What is NOT AI in DRIP</h2>
      <ul>
        <li>The <strong>outfit generator</strong> is a transparent rule-based scorer for color,
          silhouette, weather, formality, and your stated preferences. It is not a neural
          network and does not claim to be.</li>
        <li>The <strong>shopping recommendations</strong> are a gap analysis over your closet
          and a demo catalog. Not AI.</li>
        <li><strong>News personalization</strong> ranks demo articles by tag overlap with your
          followed topics, vibes, and closet. Not AI.</li>
      </ul>

      <h2>Fit Scan (full-outfit photos)</h2>
      <p>
        The beta Fit Scan does <strong>not</strong> use machine vision to automatically identify
        the pieces in your photo. You upload the photo, we ask you to crop and confirm each
        piece manually. If we later connect a real image-analysis service, this page will be
        updated to disclose the provider, what is sent, and how to opt out.
      </p>

      <h2>Face-blur option</h2>
      <p>
        You can crop out faces before uploading. If your browser supports the Face Detection
        API (Chromium-based browsers), we offer an assisted face-blur step. Otherwise you can
        draw a rectangle to blur manually. All processing happens in your browser before upload.
      </p>

      <h2>Photo storage</h2>
      <p>
        Original photos are stored in a private storage bucket. Only you can access them via
        short-lived signed URLs. You can delete the photo while keeping the outfit record.
      </p>
      <BetaFooterNote />
    </>
  );
}
