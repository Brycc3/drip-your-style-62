# Pass 3 visual verification

Verified locally on July 29, 2026. No deployment or live database mutation was used.

## Method

- Public auth states were rendered from the actual local routes. Fake implicit
  `access_token`/`refresh_token` values and a fake PKCE `code` were checked directly; neither
  unlocked the reset form.
- Authenticated Shop, Home, Profile, and admin states require account/admin data. Because no
  credentials or live database changes were authorized, those states were rendered in a temporary
  local state harness using the production dark/lime styling, the actual Phase 2 project assets,
  and the final UI copy/controls. The harness was removed after inspection.
- Desktop checks used a 1440 × 900 viewport.
- Mobile checks used a 390 × 844 viewport. The mobile document had no horizontal overflow; Shop
  cards, workflow panels, and admin forms collapsed to one 351px content column, and every
  referenced project-owned SVG loaded successfully.

## States inspected

| State                     | Desktop                                                                   | Mobile                                          | Result                                                                               |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Shop — All                | 3-column product grid                                                     | 1-column product grid                           | Verified card precedes demo concepts; labels/actions remain distinct.                |
| Shop — Verified           | Scope control and verified card                                           | Scrollable scope row                            | Only strict verified state is represented.                                           |
| Verified empty state      | Full-width centered panel inside Outfit Ideas                             | Stacked panel                                   | The verified-inventory explanation takes priority over the Outfit Ideas empty state. |
| Shop — Demo               | Project-owned tee and chain art                                           | Full-width cards                                | `DEMO`, `Sample only`, and `View Sample` remain visible.                             |
| Verified card metadata    | Retailer, price, availability, last checked, source, affiliate disclosure | Metadata collapses inside card without overflow | Clear and scannable.                                                                 |
| Admin Catalog list        | Protected demo and editable non-demo rows                                 | Rows/actions stack                              | Edit and Verify/Reverify are separate actions; demos remain protected.               |
| Add product               | Two-column validated form                                                 | One-column form                                 | Vibe, price tier, subtype/family, derived kind, and rights controls are readable.    |
| Edit product              | Edit panel with timestamp-preservation copy                               | One-column panel                                | `Save without reverifying` is distinct from the explicit Reverify action.            |
| Archive / stock status    | Archive button and availability selector                                  | Actions stack                                   | All five status choices remain available.                                            |
| Demo protected state      | Read-only badge and protection note                                       | Same content stacked                            | No destructive or conversion action appears.                                         |
| Forgot password           | Actual `/auth?mode=signin` route                                          | Responsive route dimensions                     | Entry is visible; empty-email action produces inline guidance.                       |
| Fake recovery values      | Actual `/auth/reset-password` route with fake token pair and fake code    | 390px route viewport                            | Both remain on the invalid/expired state; the reset form never appears.              |
| Expired reset callback    | Actual route with expired callback state                                  | Responsive route dimensions                     | Explicit expired-link copy appears.                                                  |
| Profile problem report    | Type + description form                                                   | One-column modal state                          | Only approved metadata is described; the 4,000-character limit remains visible.      |
| Screenshot consent        | Preview, filename/size, unchecked approval                                | One-column state                                | Selected file and approval requirement are explicit.                                 |
| Admin screenshot access   | Secure view and download actions                                          | Actions stack below preview                     | The moderation experience does not expose a raw storage path.                        |
| Onboarding starter target | 3/2/2 panel                                                               | Stacked CTA row                                 | No exact outfit-count promise; `Add First Item` is primary.                          |
| Home incomplete core      | Missing bottoms/shoes example, archived-item note, no Generate shortcut   | Single-column panel                             | Quick links omit Generate while `generatorReady=false`.                              |
| Home completed core       | Generator CTA                                                             | Single-column panel                             | Confident CTA appears only for core-ready state.                                     |
| Saved Outfits shortcut    | Home shortcut grid                                                        | 2-column shortcut grid                          | Visible in both incomplete and completed examples.                                   |
| Admin-only links          | Profile admin panel                                                       | Stacked profile state                           | Catalog and Moderation are explicitly tied to `is_admin=true`.                       |

## Defect found during visual QA

`/auth/reset-password` initially rendered the sign-up page because
`auth.reset-password.tsx` was nested below the leaf `/auth` component. The route file now uses the
TanStack parent-escape naming convention (`auth_.reset-password.tsx`), so the reset route is owned
by the root route and renders its intended invalid, expired, form, and success states.

## Draft PR #3 blocker recheck

- Actual-route desktop and mobile checks confirmed that raw fake implicit tokens and a fake PKCE
  code do not authorize recovery UI. Successful recovery authorization itself cannot be fabricated
  in visual QA; the event gate is covered by automated tests and accepts only Supabase's verified
  `PASSWORD_RECOVERY` event.
- The temporary authenticated-state sheet rendered four review states: Verified Outfit Ideas
  empty, Catalog Verify/Reverify and intelligence fields, Home with an incomplete core and no
  Generate shortcut, and admin signed screenshot actions.
- At 390 × 844, the state sheet used a 366px content column, loaded both referenced Phase 2 SVGs,
  and had `scrollWidth === clientWidth`. Controls stacked without clipping.
- The temporary state sheet was removed before commit. No screenshot was uploaded, no report or
  catalog row was created, and the migration was not applied.
