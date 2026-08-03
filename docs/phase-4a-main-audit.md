# Phase 4A main-branch audit

Audit baseline: reviewed PR #3 merge `36d7381ea71aadd181f4072c4d25e8c29ff3ac6e` through
main `60f82dbe0d6e2718fa8d8fae6f296f5c68e0ede2`. The audit is forward-only: it does not reset,
rewrite, or remove published history.

## Post-PR #3 Lovable commits

| Commit                                     | Exact tree change                                                                                                                                                                                                                                                                              | Classification     | Phase 4A treatment                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d422153b4cf559c5306210a29d286c6613ece689` | Deleted eight generated lines from `src/integrations/supabase/types.ts`, removing the `attach_problem_report_screenshot` and `verify_shop_catalog_item` RPC declarations.                                                                                                                      | generated-only     | Replace the generated regression with declarations for the reconciled RPCs and new import schema.                                                                                                    |
| `a527cb511b3d13908610350a5eb53b8652b2e2a8` | Rewrote `src/routeTree.gen.ts` with 320 additions and 320 deletions; no source route was added.                                                                                                                                                                                                | generated-only     | Do not preserve the churn as an authored change. Regenerate the tree through Vite after adding the imports route.                                                                                    |
| `c7d3892297640e20e44c3abd37d5f584176e4503` | Deleted ten generated lines from `src/routeTree.gen.ts`; no source route changed.                                                                                                                                                                                                              | generated-only     | Let route generation derive the current tree; do not manually reconstruct this edit.                                                                                                                 |
| `4721914c417e72f03898969a668f1ec4596c874f` | Replaced the 184-line `.lovable/plan.md` beta audit with a 32-line environment diagnosis (21 additions, 173 deletions).                                                                                                                                                                        | remove             | Treat as plan-only context, not production implementation. Keep published history intact and put durable deployment guidance in `docs/`.                                                             |
| `9df7d03d6728fa46dc7d960aa3b9d5994e421d92` | Restored the eight generated RPC type lines and added the 63-line applied migration `20260730025301_cb455320-3ddc-42d0-894e-6a7e610dcc9b.sql`. The migration adds weak Verify and screenshot-attachment RPC definitions but does not install the complete reviewed Pass 3 catalog protections. | preserve + replace | Preserve the generated RPC declarations and the already-applied migration file. Replace its live behavior only with a later forward-only reconciliation migration; never edit the applied migration. |
| `60f82dbe0d6e2718fa8d8fae6f296f5c68e0ede2` | Merge commit (`36d7381e` + `9df7d03d`) titled “Update plan”; it has no unique tree change relative to its Lovable parent and integrates the four file changes above into main.                                                                                                                 | generated-only     | Preserve the merge history. Base Phase 4A on this exact commit and add only forward changes.                                                                                                         |

## Resulting main-branch delta

Compared with `36d7381e`, the six commits leave four paths changed: `.lovable/plan.md`, generated
Supabase types, generated route-tree output, and the weak applied migration. Only the generated
types and applied migration are implementation inputs. The plan replacement and route-tree churn
are not copied into Phase 4A as hand-authored work.

## Environment and repository checks

- `git ls-files .env` returned no path.
- `git check-ignore -v .env` confirmed `.gitignore` ignores `.env`.
- `.env.example` is present and contains placeholders only.
- The GitHub repository is currently public; making it private remains an external owner action.
- The content-aware current-tree scan found no suspected private secret.
- The full-history introduction scan found no suspected `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_`,
  service-role JWT, private-key material, or private API-key value. The scanner suppresses matched
  values and would report only category, file, and commit.

No history rewrite or automatic secret rotation was performed.

## Draft PR #4 review-blocker reconciliation

- Batch planning now treats brand + product name + color + retailer as a descriptive identity in
  both TypeScript and PostgreSQL. Corrections replan every open row, while invalid rows do not
  inflate `duplicate_row_count`.
- Import-table writes are revoked from browser roles. Atomic staging, batch-wide correction,
  resolution, review, approval, and import are authenticated administrator RPCs.
- Manual matches retain the automated proposal and a separate create/update/skip resolution audit.
  Create requires explicit duplicate acknowledgement; update rejects demos and missing targets.
- Imports use a global transaction advisory lock and perform complete validation plus live and
  intra-batch identity preflight before the first catalog mutation. Unexpected matches return to
  manual review without a partial catalog write.
- Partial batches remain recoverable. Only approved rows are processed, terminal rows are not
  processed twice, and the batch closes only after every row is imported, rejected, or skipped.
- Account export includes import/report/image audit data. Deletion removes private drafts, unlinks
  report attachments, anonymizes imported audit ownership, and preserves imported catalog products.
- Product-image uploads use owner/batch/row draft paths. Deletion policies reject any object still
  referenced by staging or `shop_catalog`.
- CI now has an isolated Supabase job that applies all migrations in order and executes real
  PostgreSQL behavior tests for RLS, triggers, RPC atomicity, duplicates, partial imports, demo
  immutability, verification invalidation, and account deletion.
- A clean replay exposed the weak Lovable screenshot RPC changing an existing return type without
  dropping the old signature. Its historical file now contains only the required compatibility
  drop; environments where that migration is already recorded still receive all security repairs
  exclusively from the later forward-only Phase 4A migration.

Final blocker validation completed with formatting, TypeScript, changed-file ESLint, production
build, catalog validation, and `git diff --check` passing. Bun 1.3.14 reports **139 passing tests,
0 failures, and 1,180 expectations across 9 files**. The isolated Supabase CI job applies every
migration in order and passes its PostgreSQL behavior suite. Catalog validation remains exactly 51
products and 51 Phase 2 SVG assets.

The reviewed forward-only migration remains unapplied by Codex. No deployment, product import,
retailer data, or retailer photography was added.
