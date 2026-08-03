# Phase 4A visual verification

Date: 2026-08-02

Branch: `codex/phase-4a-production-cleanup-real-catalog`

## Method

The application was run locally and inspected in the in-app browser at desktop
(`1280 x 720`) and mobile (`390 x 844`) viewports. Authorized, project-owned local
fixtures were injected only into the development process to exercise populated real-product
and import-review states. Those fixtures and the local authentication bypass were removed
before validation and are not part of this branch.

No migration was applied, no product was imported, and no external retailer image was used.

## Results

| Surface                       | Desktop | Mobile | Verification notes                                                                                                                                                                                        |
| ----------------------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in                       | Pass    | Pass   | Form, password control, recovery link, confirmation resend, and Google action remained readable. Mobile form stayed within the 390px viewport.                                                            |
| Missing backend configuration | Pass    | Pass   | Rendered the controlled `BACKEND CONFIGURATION NEEDED` state without exposing environment values. The exact temporary-unavailability explanation remained readable on mobile.                             |
| Shop — Verified default       | Pass    | Pass   | Verified was the default scope and the exact verified-inventory empty state took priority. Scope and category controls remained usable through horizontal scrolling on mobile.                            |
| Shop — real-product card      | Pass    | Pass   | An authorized local fixture showed matching image, price/currency, retailer, availability, last checked, provenance, estimated outfit value, and `Shop Now`.                                              |
| Shop — Demo concepts          | Pass    | Pass   | Demo banner, `DEMO`, `Sample only`, and `View Sample` were visible. The fixture had no retailer purchase link.                                                                                            |
| CSV/JSON staging              | Pass    | Pass   | File-format guidance, source fields, rights acknowledgement, and preview-before-import control were clear.                                                                                                |
| Import preview and validation | Pass    | Pass   | Valid, invalid, warning, duplicate, create, update, skip, and manual-review states were distinguishable. Field-level validation errors were visible.                                                      |
| Duplicate review and approval | Pass    | Pass   | Duplicate reasons, per-row approve/reject controls, approve-all-valid, and import-approved controls were present without implying verification.                                                           |
| Import dashboard              | Pass    | Pass   | Staged, review, needs-verification, verified, stale, out-of-stock, and archived counts were separate.                                                                                                     |
| Catalog verification queue    | Pass    | Pass   | Verified, needs verification, archived, and demo filters were visible. Copy explained atomic invalidation after critical edits, restocking, or restoration. Mobile document width remained exactly 390px. |

## Responsive repair found during QA

The two-column import review grid could allow its detail pane to impose a wider minimum width
on mobile. The grid now uses `minmax(0, 1fr)` and both panes use `min-w-0`. Reinspection found
no horizontal document overflow in the import or verification-queue screens.

## Release boundary

This report verifies the implementation and local presentation only. Operators must still
review and apply the forward-only migration, configure production environment aliases, create
and secure the product-image bucket, and complete real retailer/source authorization before
any real item can be staged or verified.
