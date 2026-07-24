
This is a large, multi-surface pass. I want to align on scope before writing code so we don't repeat the "claimed but not visible" cycle.

## Scope (what will be visibly changed in the preview)

### 1. Inspo Builder (`src/routes/_authenticated/inspo.tsx`)
- Sticky bottom action bar (mobile) / top bar (desktop) with **Suggest next piece** + **Complete outfit** whenever any slot is empty.
- Six always-visible slots in a fixed grid: Top, Bottom, Shoes, Outerwear, Accessory, Fragrance. Empty slots get a prominent labeled `+ Add {slot}` button.
- Tapping any slot (empty or filled) sets it as the active target and opens a suggestion tray directly under the outfit.
- Suggestion tray has a source selector: **My Closet / Shop / Mix**, each card badged `Owned` or `Buy · $price`.
- Locked slots persist across `Suggest`, `Complete outfit`, `Shuffle`, and single-slot swaps.
- **Shuffle alternatives** (re-rolls active slot) + **Undo last swap** (single-step history stack).
- Saving supports mixed owned/unowned outfits; footer shows unowned subtotal only.
- Accepts `?item={catalog_id}&slot={slot}` search param to open with a Shop item locked (used by "Build around this item").

### 2. Accessories: up to 3 slots
- Accessory becomes a repeatable slot: `Accessory 1/2/3` with `+ Add another accessory` and a `No accessory` opt-out.
- Suggestion scoring weights color/metal/scale/occasion (extend `outfit-generator.ts`).
- Accessory subcategory taxonomy added to `shop-gap.ts` classifier: hats, caps, beanies, belts, bags, watches, jewelry, sunglasses, socks, scarves, wallets.

### 3. Shop redesign (`src/routes/_authenticated/shop.tsx`)
- Primary tabs replace current Kind chips: **Clothing / Shoes / Accessories / Fragrance / Outfit Ideas**.
- Accessories tab exposes subcategory chips + "Missing from your closet" / "Under $X" quick filters.
- Fragrance tab exposes family filters (fresh, woody, warm/spicy, sweet, aquatic) + occasion (date night, office, hot weather, evening).
- Session-persisted `recentlyShownIds` (localStorage keyed per user) so Refresh actually rotates and excludes recent IDs across reloads.
- Diversity penalty extended: category + brand + color + price bucket.
- Sort control adds **New arrivals** (by `created_at`).
- Skeleton grid renders immediately; cached results paint first, then SWR revalidates in the background.
- `Last refreshed HH:MM` timestamp shown.
- Every product card gets a **Build around this item** action linking to `/inspo?item={id}&slot={inferred}`.
- Filters + scroll preserved via URL search params + sessionStorage scroll restoration.
- Honest demo-catalog banner stays; catalog seeded with more variety (see §5).

### 4. Fragrance freshness
- Fragrance tab uses same recently-seen exclusion + diversity by family.
- Generate/Inspo pairing logic (in `outfit-generator.ts` scent picker) rotates through owned fragrances instead of always returning the first match — track last-picked per session.

### 5. Catalog seed expansion (data migration via `supabase--insert`)
- Add ~40 more `shop_catalog` rows: broader accessories (hats/belts/bags/watches/jewelry/sunglasses/socks/scarves/wallets), more shoes, and ~15 additional fragrances covering the family filters. All rows `is_demo=true` with plausible `buy_url` or omitted (button hidden when invalid).

### 6. Recently-seen store
- New helper `src/lib/recently-seen.ts`: localStorage-backed ring buffer (per user, per kind: `shop`, `fragrance`, `swipe`). Consumed by shop scoring, fragrance picker, and swipe deck.

### 7. Tests
- Extend `tests/shop-and-generate.test.ts`:
  - Refresh excludes recently-seen IDs
  - Accessory subcategory classifier
  - Fragrance family filter
  - Locked-slot preservation in a small builder helper
- Run `bun test`, `bun run build`, and report exact results.

## Out of scope (call out honestly, do not fake)
- No real live product feed — remains labeled DEMO.
- No image-based inspo matching.
- "New arrivals" sorts by `created_at` on the seeded catalog, not a live retailer feed.
- Accessory-scale scoring is heuristic (category-based), not vision-derived.

## Technical notes
- No schema migrations required for §1–4; only a data insert for §5.
- Files touched: `inspo.tsx`, `shop.tsx`, `shop-gap.ts`, `outfit-generator.ts` (fragrance picker + accessory slot type), new `recently-seen.ts`, `StyleTabs.tsx` (no change expected), tests.
- Keep the dark-lime streetwear design tokens; no visual rework beyond layout described above.

Confirm and I'll implement in one focused pass, then report exact test/build/lint output and the specific preview interactions to verify.
