
# DRIP Beta Readiness Audit (10–20 person private friend beta)

Foundation: integrity, stewardship, dignity, privacy, honesty. Core promise: **what to wear, why it works, whether the next buy is worth it.** Every screen judged against the beta loop: add closet → generate outfit → understand why → wear/rate → get better recs → spot one real gap.

Legend: **K**eep · **I**mprove · **P**ostpone · **R**emove. Priority: **C**ritical / **H**igh / **M**edium / **L**ater.

---

## 1. Public surface

### `/` landing (`src/routes/index.tsx`)
- Now: hero, 4 feature cards, sign-in/up CTAs, legal footer.
- **KEEP · H.** Honest, on-brand, faith values expressed as principles not decoration — good.
- Problems: copy still says "Wardrobe, Weaponized" (combat metaphor clashes with stated values); "Stop buying the fifth black hoodie" is fine; no mention of beta/demo status; no screenshot.
- Beta change: soften headline tagline, add small "Private beta" chip, keep everything else.

### `/auth` (`src/routes/auth.tsx`)
- Now: email/password primary, Google secondary, mode toggle.
- **KEEP · C.** This is the fix from the earlier blocker; leave it alone.
- Problems: no password reset / forgot flow visible; no resend-verification path; error copy generic.
- Beta change: add "Forgot password" link → Supabase reset email, and a clearer post-signup confirmation state. Nothing else.

### `/onboarding`
- Now: profile handle, vibes (incl. Other custom), starter prefs.
- **KEEP · H.** Directly feeds the recommender.
- Problems: does not seed a starter closet or explain the beta loop; users can land on empty Home with no next step.
- Beta change: add a final "Add your first 3 pieces" nudge deep-linking to `/closet/new`; keep step count small.

### `/legal/*` (11 pages + hub, `LegalDraftBanner`, `src/config/legal.ts`)
- **KEEP · C.** Required for beta. Draft banner is honest.
- Problems: none blocking; verify each page's contact email + operator name are configured before invites go out.
- Beta change: fill legal config with real operator contact; no code changes needed here beyond config.

---

## 2. Core loop (authenticated)

### `/home`
- Now: today's fit, counts, recently added, wear stats.
- **KEEP · C.** This is the anchor of the beta loop.
- Problems: empty state for a brand-new user with 0 items likely lands cold; "today's fit" may render a weak outfit when closet < ~8 pieces.
- Beta change: strong empty state ("Add 5 pieces to unlock your first fit"), suppress today's fit until minimum closet size met, keep everything else.

### `/closet` (index, `$id`, `$id/edit`, `new`)
- Now: full CRUD, image upload, tags, archive, edit-all-fields.
- **KEEP · C.** The product's foundation.
- Problems: (a) fast-add path is still ~10 fields — friction for the "small starter closet" goal; (b) no bulk-add or "photo only, tag later"; (c) accessory subtypes exist but UI grouping in the list view may still lump them.
- Beta change: add a minimal-required-fields quick-add (photo + category + color), defer rest to edit. Filter chips for the expanded accessory subtypes. No new backend.

### `/generate` (786 LOC)
- Now: vibe + weather + dress code → generated outfit with explanation, save/regenerate/mark worn.
- **KEEP · C.** This is the promise.
- Problems: file is huge — hard to iterate safely; "explanation" quality varies with closet size; no visible "why this doesn't work" when generator fails.
- Beta change: keep behavior, tighten empty/failure states; extract UI into 2–3 subcomponents for beta bug fixes (still frontend-only).

### `/saved`
- Now: list of saved outfits with recreate/mark-worn.
- **KEEP · H.** Closes the loop.
- Problems: reachable from Style hub only — not from bottom nav; users lose track.
- Beta change: surface a "Saved" quick link on Home; keep as sub-route.

---

## 3. Style hub subpages (`/generate`, `/inspo`, `/swipe`, `/saved`, `/taste`)

### `/inspo` (954 LOC — largest file)
- Now: slot-based interactive outfit builder with suggestion tray, "build around this," accessory drawers.
- **IMPROVE · H.** Strong differentiator once it works, but size is a bug risk.
- Problems: complexity concentrated in one file; state model likely to leak bugs during beta.
- Beta change: keep feature, split into slot components + suggestion hook in beta stabilization pass. No new capability.

### `/swipe`
- Now: like/pass on generated outfits to teach preferences.
- **IMPROVE · M.** Feedback signal is valuable, but as a standalone screen it competes with Generate.
- Problems: duplicates the "look at outfits" job; users may not understand it changes rankings.
- Beta change: keep, but demote from primary Style tab to a "Teach DRIP" card inside Home/Taste. Reconsider post-beta.

### `/taste`
- Now: view/edit preferences learned from swipes and onboarding.
- **KEEP · M.** Transparency = trust.
- Problems: hidden inside Style hub; discoverability low.
- Beta change: link from Profile too.

---

## 4. Social surface

### `/feed`, `/o/$slug`, `/u/$handle`
- Now: public outfit leaderboard, shareable outfit pages, public profile pages.
- **POSTPONE · H.** Explicitly outside beta priorities (large social feed, stranger interaction). Also the earlier security scan already flagged public-readability issues on `follows`/`outfit_likes` — social surface increases privacy blast radius on a 10–20 person beta.
- Problems: distracts from the private-wardrobe promise; invites moderation load DRIP is not staffed for; `Feed` occupies a primary bottom-nav slot.
- Beta change: hide `/feed` from bottom nav; keep `/o/$slug` reachable only via explicit "Share" from a saved outfit (private link, `noindex`); gate `/u/$handle` behind opt-in public profile toggle default OFF. Do not remove code — just don't route to it.

---

## 5. Shop

### `/shop` (800 LOC)
- Now: tabs (Clothing/Shoes/Accessories/Fragrance/Outfit Ideas), gap-based recs, "Build around this," CatalogImage w/ placeholders, `loremflickr` URLs.
- **IMPROVE · C.** Central to the "worth it?" promise but currently the weakest link.
- Problems: (a) images are third-party loremflickr — unstable, off-brand, and arguably dishonest if presented as products; (b) 100 demo items still read as fake because they're keyword-searched stock photos; (c) no visible "demo / sample only" badge on tiles per user's stated honesty requirement; (d) file too large.
- Beta change: replace loremflickr URLs with the ~40 committed SVGs already in `public/catalog/phase-2/` for tiles that have them and a category-tinted placeholder for the rest; add a persistent "Sample catalog — not for sale" ribbon on every tile; keep gap-based reasoning copy. No live merchant integrations.

---

## 6. Scents

### `/scents`
- Now: separate fragrance CRUD (family, notes, projection, longevity), pairing.
- **IMPROVE · M.** Fragrance is in the complete-look scope but a separate route duplicates Closet.
- Problems: earlier direction merged Fragrances into Closet; standalone `/scents` route is a leftover duplicate flow.
- Beta change: keep the pairing logic; drop the standalone tab from nav and reach it as a filter inside `/closet` (Fragrance category). Move the pairing explanation into the outfit result card.

---

## 7. Profile / account

### `/profile`
- Now: account settings, export data, delete account, legal links.
- **KEEP · C.** Data controls are beta-required.
- Problems: verify delete re-auth wording matches the actual `deleteMyAccount` server fn (requires typing account email); confirm export download UX works on mobile; report/block entry points from other users' content may not be wired to `/u/$handle` and `/o/$slug`.
- Beta change: add Report/Block affordances to public outfit and profile pages (only if those remain reachable); otherwise this screen is fine.

---

## 8. Shell / infra

### `AppShell` bottom nav
- Currently 6 tabs: Home · Closet · Style · Feed · Shop · Profile.
- **IMPROVE · C.** Feed should not be primary in beta.
- Beta change: 5 tabs — Home · Closet · Style · Shop · Profile. Reclaim space.

### `InstallPrompt` / PWA
- **KEEP · M.** Manifest + prompt exist.
- Problems: verify icons + manifest still match current name/colors; ensure prompt is not shown on first visit before signup.
- Beta change: defer prompt until after first outfit generated.

### Error reporting (`lovable-error-reporting`, `error-capture`)
- **KEEP · H.** Route errorComponent + reporter wired.
- Beta change: add a visible "Report a bug" link in Profile that opens `content_reports` with `target_type: 'other'` (schema already exists).

---

## 9. Duplicates, dead ends, over-claims

- **Duplicate flow:** `/scents` vs Closet Fragrance category.
- **Duplicate discovery:** Swipe vs Generate — both surface outfits.
- **Dead ends:** `/saved` and `/taste` only reachable via Style hub tabs.
- **Over-claim:** landing headline "Weaponized"; Shop tiles presented like real products with loremflickr photos and prices but no purchase — needs explicit "sample" framing.
- **Privacy concerns visible in code:** public feed + public profile routes + follows/outfit_likes tables broaden the surface area beyond a 10-person beta; already touched by security scan. Recommend disabling routes, not just tightening RLS.
- **Faith-integrity check:** no screen forces religious content — good. Values should show up as behavior (honesty labels on Shop, transparent recommender, real delete, real export) rather than copy.

---

## 10. Smallest coherent beta set

Public: `/`, `/auth`, `/onboarding`, all `/legal/*`.
App: `/home`, `/closet` (+ new/edit/detail), `/generate`, `/saved`, `/inspo`, `/shop`, `/profile`.
Kept but not primary: `/taste`, `/swipe` (as a Home card).
Hidden for beta: `/feed`, `/u/$handle`, `/o/$slug` (code stays; nav removed; social RLS conservative).
Merged: `/scents` → Closet filter.

---

## 11. Numbered build order (audit deliverable — no edits yet)

1. **Bottom nav trim** — drop Feed, add Saved shortcut on Home. (C)
2. **Landing copy pass** — remove combat metaphor, add beta chip. (C)
3. **Auth: forgot-password + resend-confirmation.** (C)
4. **Onboarding → "add 3 pieces" nudge** into `/closet/new`. (C)
5. **Closet quick-add mode** (photo + category + color only). (C)
6. **Shop honesty pass** — swap loremflickr for existing SVGs + placeholders, add "Sample — not for sale" ribbon on every tile. (C)
7. **Home empty state** — gate today's fit behind minimum closet size. (H)
8. **Merge `/scents` into Closet fragrance filter**; keep pairing logic in outfit result. (H)
9. **Hide social routes from nav**; make `/o/$slug` share-only and `/u/$handle` opt-in default off. (H)
10. **Report-a-bug link in Profile** using existing `content_reports`. (H)
11. **Delete/export UX verification** on mobile + re-auth wording. (H)
12. **Split `/inspo` and `/generate` into subcomponents** for beta bug-fix safety (no behavior change). (M)
13. **Move Swipe off Style tab** into a "Teach DRIP" Home card; add Taste link to Profile. (M)
14. **PWA polish** — defer install prompt until after first generated outfit; verify icons/manifest. (M)
15. **Legal config fill** — operator name + contact email in `src/config/legal.ts`. (C, config only)

Postponed for after beta: marketplace/payments, seller flows, stranger DMs, large social feed, luxury auth, virtual try-on, live shopping, retailer integrations, richer AI vision.
