# Review preview and staging prerequisites

## What was checked (2026-09-09 America/Chicago)

Read-only Lovable project/database metadata shows `drip-your-style-62`, project
`ed53416f-198e-4c50-86d3-3d9565811013`, still at `c53408944349eeb56922a9848fb441b9e3def88c`,
private and unpublished, with a Supabase backend enabled. Workspace listing also returns
Style Companion and Style Stack; neither is identified as DRIP staging. No available metadata
confirms a dedicated non-production backend. **Do not use the connected backend for test writes.**
Private/unpublished is a frontend property, not database isolation.

[Lovable's current environment guidance](https://docs.lovable.dev/features/environments)
states that drafts do not provide a second database and describes retirement of its beta
Test/Live split on September 21, 2026. Do not rely on an old Test label without confirming the
actual project/database identity and lifecycle. No existing environment was deleted or changed.

## Review immediately without a backend

```sh
git fetch origin
git switch codex/phase-4a-production-cleanup-real-catalog
git pull --ff-only origin codex/phase-4a-production-cleanup-real-catalog
npm ci
npx vite --config scripts/visual-review/vite.config.mjs
```

Open `http://127.0.0.1:4175/shop`, switch to Demo concepts, then try Profile, Create,
Inspo Builder, Saved, Swipe and Closet. This is **fixture-only visual review**, not an authenticated
preview. It needs no backend credentials and cannot import products. See the [harness limits](../../scripts/visual-review/README.md).

For the actual app's local Node build (not the fixture harness), use `npm run build:preview`,
then `HOST=127.0.0.1 PORT=4178 npm run preview`. The default `npm run build` preserves the
Cloudflare production target; it must not be served with the Node preview command. Supply only
approved staging config to exercise authenticated routes. Placeholder config can review public
screens but deliberately cannot authorize sign-in. No deployment occurs in either local command.

## Dedicated staging: exact next inputs and approval

If a separate environment already exists, the owner should provide these **non-secret** identifiers:

1. Supabase organization/project name, project reference and HTTPS API URL, explicitly confirmed
   non-production, plus whether it contains only disposable test data.
2. Private frontend preview project ID/provider and HTTPS origin, and confirmation that its code
   source will be this PR branch/commit, not `main`.
3. Test account email aliases (two ordinary users and one admin), enabled auth provider names,
   and the redirect origins allowed for staging. Do not send passwords, tokens or service keys.
4. Approval to prepare that isolated database, configure its private preview, and create only
   disposable test accounts/data. This is separate from production approval and inventory import.

If none exists, create a **separate empty Supabase project** in the intended organization, clearly
named DRIP staging, or an explicitly isolated Supabase preview branch. Do not copy production user
rows or photos. Review the account's quota and price quote first. Supabase documents isolated
branches [here](https://supabase.com/docs/guides/deployment/branching) and separate environments
[here](https://supabase.com/docs/guides/deployment/managing-environments).

**Costs before provisioning:** no resources were provisioned. Local fixture review uses existing
machine resources only. A hosted project may require a plan upgrade or additional compute/storage/
egress. Supabase's [branching usage page](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
currently lists Micro branch compute starting at $0.01344/hour (about $9.68 for 30 days continuous
compute alone), plus applicable usage/subscription costs; branches are not protected by Spend Cap.
Frontend hosting, email delivery and affiliate services may have separate fees. Obtain the exact
provider quote and explicit spending approval before selecting a paid option; no zero-cost quota
availability is assumed for this account.

## Database prerequisite — do not blindly reset or push migrations

No new migration is introduced by this customer-facing implementation. Earlier Phase 4A migrations
are still required. The applied Lovable migration must remain byte-for-byte unchanged.
Read [the exact compatibility and migration-history strategy](../real-catalog-import-guide.md#immutable-migration-replay-and-upgrade).

For a **fresh disposable local database** with Docker and Supabase CLI 2.111.0, run:

```sh
bash scripts/verify-phase4a-database-path.sh fresh
bash scripts/verify-phase4a-database-path.sh existing-upgrade
```

These scripts start/reset/stop local containers only. They explicitly insert the clean-replay
compatibility step before the historical return-type-changing migration, repair **local** history,
then apply the reconciliation. A naive clean `supabase db push` is not the documented baseline.
For a new hosted staging project, prepare an approved clean baseline using this same boundary
sequence in its disposable environment and confirm history before connecting the preview; do not
run local-only commands against a linked production project. The executor must first verify the
target ID and tailor the reviewed baseline transfer to the hosting provider.

For an **existing approved staging** backend whose history already has the weak Lovable migration,
inspect `supabase migration list` after linking the confirmed staging ref. Expected checkpoint:
`20260729220000` and `20260730025301` applied; `20260802010000` pending. Review the pending SQL,
take a staging backup, then run `supabase migration up` only in the approved staging change window.
Do not apply the compatibility SQL or rewrite/repair existing applied history. Confirm final RLS,
RPC and storage policy checks using the integration scripts in isolation first.

## Configure and review the authenticated candidate

1. In the isolated preview provider, set the browser and server URL/publishable-key pairs from
   `.env.example` to the **same staging project**, through provider settings. Keep service-role keys
   server-only. Never paste secrets into chat or commit `.env`.
2. Point the frontend at this PR's tested commit; build with `npm ci && npm run build`, serve via
   the existing TanStack/Nitro deployment adapter. No fixture aliases belong in that build.
3. Follow [auth configuration](../deployment-auth-configuration.md): exact preview redirect URLs,
   provider callbacks, confirmation and recovery email delivery. Keep preview access private.
4. Use two real staging users to test signup, confirmation, login, logout, recovery, onboarding,
   upload/edit/archive/delete, refresh/sign-in preference persistence, owned outfit save/wear,
   shopping-idea separation, and cross-user denial. Test admin screenshot/download and import
   staging with authorized inputs only. Delete disposable account data and verify storage cleanup.
5. On actual mobile browsers, install the production build, reconnect, cold-open offline after
   installation, verify the generic shell, resume online, and inspect that no private content was
   cached. The VM worker tests do not substitute for this device check.

## Merge and Lovable update — still on hold

After staging acceptance and a separate explicit merge approval, merge PR #4 with a normal merge
commit (no history rewrite). Confirm `main` contains the tested head and Lovable reports that new
commit before reviewing its preview. A working-branch push does not make the main-connected
Lovable preview current. Do not change GitHub's default branch to force a preview.

Production database/configuration/import approvals remain separate. Prepare the reviewed
reconciliation before code paths requiring it are enabled on the existing backend. Public launch
also needs authorized real inventory, legal owner/support/jurisdiction/date and counsel review,
auth delivery tests, and device acceptance. For a regression, revert the release merge with a new
commit; do not reset published history or roll back database schemas destructively. Disable a bad
catalog product by archiving it and preserve audit history.
