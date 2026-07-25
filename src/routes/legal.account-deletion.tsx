import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalDraftBanner, BetaFooterNote } from "@/components/LegalDraftBanner";

export const Route = createFileRoute("/legal/account-deletion")({
  head: () => ({
    meta: [
      { title: "Account & Data Deletion — DRIP" },
      { name: "description", content: "How to export or delete your DRIP account." },
    ],
  }),
  component: Del,
});

function Del() {
  return (
    <>
      <LegalDraftBanner />
      <h1>Account & Data Deletion</h1>

      <h2>Export your data</h2>
      <p>
        Go to <Link to="/profile">Profile</Link> → <em>Privacy & Data</em> → <em>Export my
        data</em>. You get a JSON file with your profile, preferences, closet items, saved
        outfits, wear history, and feedback.
      </p>

      <h2>Delete a single photo</h2>
      <p>
        Open the closet item, tap <em>Edit</em>, then <em>Delete photo</em>. The item record
        stays; the image is removed from storage.
      </p>

      <h2>Delete your entire account</h2>
      <p>
        Profile → <em>Privacy & Data</em> → <em>Delete account</em>. You will be asked to
        re-confirm your password and to type your email address. On confirmation we permanently:
      </p>
      <ul>
        <li>Delete every row you own in closet, outfits, feedback, wear history, preferences,
          fragrances, comments, likes, saves, follows, blocks, reports, and profile.</li>
        <li>Delete every object in your storage folder <code>closet/&lt;your-id&gt;/</code>.</li>
        <li>Delete your authentication record.</li>
      </ul>
      <p>
        Deletion cannot be undone. Backups are retained for up to 30 days for disaster
        recovery, after which the data is unrecoverable.
      </p>

      <h2>What we keep after deletion</h2>
      <p>
        If you filed reports about other users, the report record may be retained (with your
        user id nulled) for platform-safety purposes.
      </p>
      <BetaFooterNote />
    </>
  );
}
