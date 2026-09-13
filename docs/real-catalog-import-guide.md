# Real catalog import guide

Phase 4A stages authorized product data without mixing it with the 51 Demo Concepts. No real
products are bundled with the repository.

## Before importing

1. Review `docs/real-product-source-policy.md` and obtain written source and image authorization.
2. Apply the reviewed forward-only Phase 4A migration in a controlled database change window.
3. Set `profiles.is_admin=true` only for the administrators who will review catalog data.
4. Start with `catalog/import-template.csv` or `catalog/import-template.json` and remove the
   placeholder row.

## Workflow

1. Open `/admin/catalog/imports` and enter the real source name and optional HTTPS source URL.
2. Select a CSV or JSON file of at most 1 MB and 500 rows.
3. Acknowledge the rights/provenance warning and choose **Preview before import**.
4. Filter valid, invalid, duplicate, and warning rows. Every validation error is retained with the
   staged row.
5. Correct normalized JSON as needed. The original raw row remains immutable. Saving a correction
   replans every open row in the batch and clears stale approvals and manual decisions.
6. For a possible duplicate, record one explicit resolution: **Create as new** (with confirmation),
   **Update existing** (with a non-demo product UUID), or **Skip row**. Resolution is audited
   separately from the automated proposal and is required before approval.
7. Approve or reject each row, or approve every currently valid, resolved row.
8. Choose **Import approved**. Creates enter `shop_catalog` with `is_demo=false`, `archived=false`,
   `verified_at=null`, and `last_checked_at=null`. Exact source matches update an existing non-demo
   product; critical changes clear old verification in the same database update.
9. If unresolved rows remain, the batch becomes `partially_imported`. Correct or resolve them and
   run **Import approved** again; already imported, rejected, and skipped rows are terminal and are
   never imported twice.
10. Open `/admin/catalog`, review the complete stored record, then use the separate Verify/Reverify
    action. Only that RPC can assign both verification timestamps.

## Duplicate decisions

- **create**: no source or descriptive identity matched;
- **update**: retailer + external ID or normalized product URL matched a non-demo catalog row;
- **skip**: an exact identity already appeared earlier in the same batch;
- **manual review**: descriptive identity matched or a protected demo conflict was detected. A
  separate create/update/skip resolution must be recorded before approval. Validation failures
  remain unapprovable until corrected.

The planner checks retailer/external ID, canonical URL, and brand/name/color/retailer across the
whole batch and live catalog. The importer repeats those checks inside one locked database
transaction. A new unexpected match returns the row to manual review before any catalog write.

### Canonical product URL identity

TypeScript planning and PostgreSQL replanning/import checks implement the same specification:

- parse an absolute HTTPS URL and reject credentials or malformed input;
- lowercase only the hostname while preserving path case;
- remove the fragment;
- remove only case-insensitive `utm_*`, `ref`, `affiliate`, and `aff` tracking parameters;
- preserve meaningful parameters, including `variant`, `sku`, `color`, `size`, `product`, and
  `style`;
- decode then RFC 3986-encode query keys and values, sort by encoded key and value using bytewise
  order, and retain distinct values; and
- remove unnecessary trailing path slashes (including the root slash).

The shared fixture file at `tests/fixtures/product-url-canonicalization.json` is exercised against
both implementations. Two URLs with different path case or product-variant values intentionally
remain different identities.

## CSV details

The parser supports quoted fields, escaped quotes, commas inside quoted fields, and CRLF files.
Available sizes may be separated with `|` or `;`. Booleans accept `true/false`, `yes/no`, or `1/0`.
Currency defaults to USD; supported currencies are USD, CAD, EUR, GBP, and AUD.

## JSON details

Use either a top-level array or `{ "products": [] }`. Each product must be an object. The same
server validation runs for CSV, JSON, staged corrections, and final database import.

## Authorized image upload

Inside a staged-row correction, acknowledge display rights and upload a PNG, JPG, WebP, or AVIF.
The browser uploads only to an owner-, batch-, and row-bound draft path in the administrator-
protected `catalog-products` bucket and inserts the resulting URL into normalized data. Record
`image_rights_basis` and `source_url` accurately before saving. Closing the editor or a failed save
removes the uncommitted upload; replacement cleanup is allowed only when no staged row or catalog
product references the prior object. Uploading an image does not approve, import, or verify the row.

## Atomicity and account retention

Batch metadata, immutable raw rows, normalized rows, planning, and counts are staged by one admin
RPC. Any error rolls back the complete batch. Final import revalidates every field in PostgreSQL
before the first product mutation.

An administrator data export includes owned import audit rows, reports, and owned screenshot/image
paths. Account deletion removes uncommitted private batches and private report files, anonymizes
creator/reviewer references on imported audit history, and preserves company catalog products and
any image they still reference.

## Immutable migration replay and upgrade

`20260730025301_cb455320-3ddc-42d0-894e-6a7e610dcc9b.sql` is already applied and must stay
byte-for-byte identical to `main` (SHA-256
`b78d464dc0feb701692ae1b03eed3aba5d8f5985a48da29f90856ef4ddbe8de1`). The historical migration
changes a Pass 3 RPC return type from `void` to `boolean`; PostgreSQL requires the old signature to
be dropped first. New baseline verification therefore uses the additive, non-migration
compatibility file `supabase/compatibility/20260730025301_clean_replay.sql` immediately after Pass
3 and immediately before the immutable migration. Existing databases must not run that
compatibility file because they already contain the boolean RPC.

The two isolated verification commands are:

```sh
bash scripts/verify-phase4a-database-path.sh fresh
bash scripts/verify-phase4a-database-path.sh existing-upgrade
```

The fresh script executes this exact Supabase sequence: `supabase start`, `supabase db reset
--local` through the Pass 3 checkpoint, the compatibility SQL and immutable migration through
transactional local `psql`, `supabase migration repair 20260730025301 --status applied --local`,
then `supabase migration up --local`. The temporary checkpoint is necessary because `supabase
start` otherwise applies every visible migration before an inter-version compatibility boundary
can run. Both held files are restored before migration history is repaired or advanced.

The existing-upgrade verification constructs and asserts the same recorded weak checkpoint, then
runs `supabase migration up --local`. A reviewed linked environment whose history already records
the weak migration uses `supabase migration up` in its controlled change window; it does not run a
history repair or the clean-baseline compatibility file.

Immediately before the Phase 4A upgrade, the required history is:

- `20260729220000`: applied;
- `20260730025301`: applied and exposing the weak boolean screenshot RPC; and
- `20260802010000`: pending.

After `migration up`, all repository migration timestamps through `20260802010000` must appear
exactly once in `supabase_migrations.schema_migrations`. The verification script compares that
table with the sorted migration filenames, so neither path silently depends on an out-of-order
migration.
