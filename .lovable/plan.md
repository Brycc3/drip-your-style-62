
# DRIP Stabilization Pass

Big scope, so I'm laying out the plan before touching code. Nothing here adds marketplace features — it hardens what's already promised.

## 1. Outfit generator (`src/lib/outfit-generator.ts`, `generate.tsx`)

- Replace unused `regen` seed with a real **rotation index**: after sorting, take a window offset by `regen % N` so "More" cycles through the next best combos while staying deterministic per state.
- Add `occasionScore`: match against profiles for `work, date, church, brunch, gym, errands, party/concert, travel, formal, outdoor` — each profile maps to preferred categories/formality/season/vibes and a keyword bloom over item names/brands/notes.
- Add `preferenceScore` from `outfit_feedback` (liked item ids → boost, passed → penalty).
- Return a **breakdown object** `{ color, silhouette, weather, formality, occasion, preference, diversity }` so cards show separate scores.
- Fix `outfit_items` insert bug: currently zips pieces to `roles[i]` after filtering, mis-labeling when outerwear is null. Build explicit `[{role:'top',item},{role:'bottom',item},…]` pairs.
- Fix **Mark worn**: if outfit not saved, save private first, then insert `wear_history` row and bump `times_worn`/`last_worn_at` on each `closet_items.id`.

## 2. Privacy & data correctness

Migration:
- Drop any public/anon SELECT policy on `storage.objects` for the `closet` bucket; keep owner-only (`bucket_id='closet' AND owner = auth.uid()`).
- Audit RLS on `closet_items, saved_outfits, outfit_feedback, wear_history, fragrances, user_preferences`: private tables must scope every command to `auth.uid() = user_id`; only `saved_outfits` with `visibility='public'` and its `outfit_items`/counters may be anon-readable.
- Public outfit share: `/o/$slug` should resolve via `saved_outfits.cover_image_url` (already a storage path). Add a server function `getPublicOutfitCover(slug)` that verifies visibility=public and returns a **short-lived signed URL** — do not expose the raw path or let anon list the bucket.

Fragrance unification:
- Remove `fragrance` from `closet.new` category options and from generator categories.
- Build `/_authenticated/scents` add/edit/delete against `fragrances`.
- Home scent count reads `fragrances`.

## 3. Complete MVP interactions

- **Swipe**: real page — generates 20 candidate outfits, shows one card at a time with Like/Pass buttons + basic pointer-drag translate/rotate. Persists to `outfit_feedback` (add liked/passed item ids as arrays or per-piece rows — reuse existing schema).
- **Shop gap scorer**: for each `shop_catalog` item, compute (a) category shortfall vs a target profile (e.g. want ≥3 tops, ≥3 bottoms, ≥1 outerwear, ≥2 shoes), (b) matched owned pieces by color/formality/season, (c) estimated new outfits unlocked (count of valid top/bottom/shoe combos gained), (d) duplicate warning if user already owns same category+brand+color. Persist Save/Dismiss to `shop_feedback`.
- **Scents pairing**: on generated outfit cards, pick best fragrance by (family↔vibe map, season/temp, projection↔formality, occasion). Show pairing + one-line rationale.
- **Accessories**: add filter chip in `closet.tsx`; include as optional 5th slot in outfit cards (already partially wired).
- **Home recently added**: render signed URLs (batch fetch).

## 4. PWA & quality

- Add `public/sw.js` (network-first for HTML, cache-first for hashed assets, excludes `/~oauth`) via a small handwritten worker; guarded registration wrapper that refuses in Lovable preview/dev/iframe and supports `?sw=off`.
- Manifest already valid; add theme-color and apple-touch-icon `<link>`s if missing.
- `<InstallPrompt />` component: listens for `beforeinstallprompt`, shows lime CTA; on iOS Safari shows "Tap Share → Add to Home Screen".
- Tests: add **vitest** + jsdom.
  - Unit: `outfit-generator` (harmony, silhouette, season, formality, occasion, rotation determinism), gap scorer, fragrance pairer.
  - Smoke: render key routes with mocked supabase client; assert critical CTAs exist.
  - `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.
- Loading/empty/error states: audit each route, add retry buttons on failed queries, remove "Coming in Phase X" copy from Swipe.

## Out of scope (Phase 2, documented in README)

Peer-to-peer selling, thrift feeds, live brand APIs, vision auto-tagging. I'll leave extension points: `shop_catalog.source_url`, `fragrances.notes` JSON, generator's pluggable scorer signature.

## Deliverable

Concise summary of fixes + any manual config blockers (e.g. if a Supabase storage policy can't be dropped via migration and needs dashboard action — but on Lovable Cloud I'll do it via SQL).
