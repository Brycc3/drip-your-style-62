
This is a very large multi-surface build. I want to align on scope and sequencing before writing code, because doing all six priorities in one pass would produce a mess and hide honest gaps. I'll flag exactly what will be real vs. mocked.

## What I will build (in this order, one PR-sized pass each)

### P1 — Legal & Safety Center
- New `src/config/legal.ts` with admin placeholders: `LEGAL_OWNER`, `SUPPORT_EMAIL`, `JURISDICTION`, `EFFECTIVE_DATE`, `MIN_AGE=18`, `ENTITY_CONFIGURED=false`.
- New public routes under `/legal/*`: `privacy`, `terms`, `community-guidelines`, `acceptable-use`, `account-deletion`, `copyright`, `affiliate-disclosure`, `location-weather`, `ai-image-processing`, `beta-notice`. Index page at `/legal`.
- Every page reads copy from `legal.ts` and shows a red admin banner ("Beta legal drafts — review before public commercial launch. Publishing blocked until owner fields are set.") whenever `ENTITY_CONFIGURED=false`.
- Footer link on public landing + `/legal` link in Profile → Settings section.
- Real user controls in Profile → Privacy & Data:
  - Export my data (server fn: zips closet/outfits/feedback/preferences JSON, returns download).
  - Delete account (requires typing email to confirm + re-auth via password prompt; server fn deletes rows across owned tables and storage objects in `closet/{uid}/`, then `supabaseAdmin.auth.admin.deleteUser`).
  - Per-photo delete already exists in closet edit; surface a "Delete photo only" button.
- Full-fit photos and new outfit photos default `visibility='private'`; migration adds `visibility` column to `saved_outfits` if missing and flips default.
- Report/block scaffolding: `content_reports` table + report button on public outfit pages (`/o/$slug`).

### P2 — Rebuild demo catalog
- Migration: `TRUNCATE shop_catalog` then insert ~100 rows across Clothing/Shoes/Accessories/Fragrance with balanced color/price/season/formality and NO `buy_url` (all "View sample"). `is_demo=true`, `retailer=null`.
- All images use the existing `CatalogImage` category fallback (already polished). I will not fabricate retailer photos or hotlink. Optional: generate ~15 hero images for the most-shown items via imagegen and upload as lovable-assets; the rest use the gradient/emoji placeholder. **This means most tiles will remain placeholder art — that is honest for a demo catalog and I will not disguise it.**
- Shop query: first page limited to 12 (`.limit(12)`), "Load more" appends next page, sessionStorage for tab/filter/scroll, `recently-seen` already wired for refresh diversity.
- Outfit Ideas tab: real generator that pairs 1 recommended demo item with 2–4 owned closet pieces, each labeled Owned/Recommended. Empty state when closet is too small.
- Recommendation reasons already computed in `shop-gap.ts`; surface owned-piece thumbnails on each card and "estimated outfits unlocked".
- "Report broken link" button (writes to `content_reports` with kind='broken_link').

### P3 — The Edit (Discover sub-section)
- New route `/_authenticated/discover.tsx` with sub-tab "The Edit" (not a new bottom-nav item; lives inside a new Discover entry point I'll place under Profile menu + Home quick link to avoid nav overload).
- Migration: `news_articles` (source, author, published_at, headline, summary, why_matters, topics text[], external_url, canonical_url, image_url, image_license, is_demo), `news_topic_follows`, `news_interactions` (saved/hidden/read).
- Seed ~15 demo articles across streetwear, sneakers, menswear, womenswear, accessories, jewelry, eyewear, fragrance, thrift, sustainability, runway, business, Houston, releases. Marked `is_demo=true`. Summaries are original short blurbs; no copied content.
- Personalization score = overlap(user vibes/brands/colors/topics_followed, article.topics + keywords) - hidden penalty.
- Controls: Follow topic, Mute source/topic, Save, Not interested, "Why recommended" popover, Mark read.
- Schema is ready for RSS ingestion later; no scraper included.

### P4 — Fit Scan + Lookbook
- Migration: `outfit_logs` (user_id, photo_path, date, occasion, weather, location text, vibe, notes, rating int, compliments int, visibility default 'private', keep_photo bool) and `outfit_log_items` (log_id, closet_item_id, region jsonb nullable).
- Route `/_authenticated/fit-scan.tsx`: upload/camera → client-side crop (react-easy-crop already unavailable; use a lightweight canvas cropper I'll write) → optional face blur (canvas: detect via `FaceDetector` API when available, else user draws a rect to blur) → confirm-pieces step: manual slot picker (top/bottom/shoes/outerwear/accessories×N) → for each slot, match to existing closet item (fuzzy on category+color+brand) OR "Create new closet item" prefilled.
- No claim of AI extraction. Copy: "Help us identify each piece."
- Route `/_authenticated/lookbook.tsx`: grid of outfit_logs, filters (occasion/season/vibe/favorite/date), detail view with flat-lay of linked items, edit linked pieces, duplicate, "Recreate this fit" → `/inspo?log={id}` preloads slots.
- "Delete photo only" keeps the log record.

### P5 — First-class accessories
- Migration: extend `closet_items` with `accessory_subtype text`, `placement text`, `material text` (if missing), `metal_finish text`, `measurements text`. Add CHECK-less validation via trigger.
- New taxonomy file `src/lib/accessories.ts` with all subtypes grouped by placement (head/eyes/ears/neck/wrist/hands/waist/bag/socks/face). Full list per your spec.
- Closet add/edit form: when category='accessory', show subtype + placement + metal/finish + measurements fields.
- Inspo Builder: replace single accessory slot with an "Accessory drawer" grouped by placement. Multi-add up to 6 with soft warning "This look is getting busy" past 4.
- Outfit generator: pick 1–4 accessories weighted by vibe/formality; explanations include contrast/polish/scale/metal harmony/color repetition/focal point.
- Fit Scan, Saved Outfits, Shop Outfit Ideas, and outfit cards all render accessory lists with placement labels.

### P6 — Beta Readiness admin
- Route `/_authenticated/admin/beta-readiness.tsx` gated by a new `user_roles` row (`admin`). Uses the `has_role` pattern.
- Checklist reads live state:
  - legal placeholders (`legal.ts` ENTITY_CONFIGURED)
  - support email set
  - account deletion test flag (manual toggle)
  - two-user privacy test (manual)
  - storage privacy test (auto: attempt anon download of a known private path)
  - catalog audit (auto: count items with valid image or placeholder = 100%)
  - social report/block test (manual)
  - Fit Scan consent test (manual)
  - news labeled demo (auto: all articles is_demo=true)
  - marketplace disabled (constant)
  - error monitoring (checks Sentry env var; not configured by default → shown as "Not configured", honest)
- App-wide "Ready for public launch" banner only appears when all mandatory checks pass; otherwise shows "Beta — not ready for public launch".

## QA I will run at the end
- `bun test`, `bun run build`, `bun run lint` — report exact output.
- Playwright: desktop + mobile viewport walkthrough of Legal Center, Shop tabs+refresh, The Edit personalization, Fit Scan upload with manual confirm, add earrings/glasses/chain/watch/bag/socks/grills, multi-accessory Inspo, private-by-default check on new outfit photo.

## Honest limitations I will NOT hide
- No real retailer feed, no real news feed, no real image-analysis model. Everything AI/retail/news-facing is clearly labeled DEMO in-app.
- Legal copy is my draft, not attorney-reviewed. Every page carries the beta banner.
- Face blur uses browser `FaceDetector` when available (Chromium) and falls back to manual rectangle blur.
- Data export is JSON only, not a full GDPR-grade portable archive.
- Storage-privacy check hits a known private path; not a full pen test.
- Sentry/error monitoring is not wired unless the user provides a DSN secret.
- No trademark rebrand.

## Sequencing
Because this is ~6 PRs of work, I'll ship it in this order and pause for your OK between P2 and P3 so you can sanity-check the catalog before I invest in news + fit scan + lookbook:
1. P1 Legal Center + deletion + defaults
2. P2 Catalog rebuild + Shop pagination + Outfit Ideas
   → checkpoint
3. P5 Accessories taxonomy (needed by P4 and P3 personalization)
4. P4 Fit Scan + Lookbook
5. P3 The Edit
6. P6 Admin checklist + final QA

Reply "go" to proceed with P1, or tell me which priorities to drop/reorder. If you want it all in one shot with less thorough QA between steps, say "one pass" and I'll batch it.
