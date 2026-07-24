# DRIP Usability Pass — Implementation Plan

Large scope. I'll deliver in ordered chunks so each piece is testable before the next lands. If any section is lower priority for you, tell me and I'll cut it.

## 1. Database & RPCs (single migration)

- New table `item_wears (id, user_id, closet_item_id, worn_on, created_at)` for item-only wears — separates item wear from outfit wear.
- Add `archived_at timestamptz` to `closet_items`; add `pinned bool default false` to `closet_items` and `saved_outfits`; add `planned_for date` (nullable) to `saved_outfits`.
- New RPC `remove_outfit_wear(_wear_id uuid)`: deletes owner's `wear_history` row, decrements `closet_items.times_worn` for every associated piece (clamped ≥0), recomputes `last_worn_at` from remaining wears, updates `saved_outfits.worn_at` to most-recent remaining or null. Atomic.
- New RPC `remove_item_wear(_wear_id uuid)`: same shape for item-only wears.
- New RPC `record_item_wear(_item_id uuid, _worn_on date)`: idempotent insert + counter update, returns wear_id (enables Undo).
- Grants + RLS for `item_wears`; keep `is_following` grant migration from last turn.

## 2. Closet Item Editing (§1)

- New route `_authenticated/closet.$id.edit.tsx` with full form (all fields, tags, secondary colors, accessory subtype).
- Photo replace: upload new → update row → delete old only on success.
- Archive/Unarchive toggle on detail page; filter `Archived` chip in Closet; exclude archived from generator + shop scoring.
- Edit button on `/closet/$id`; Cancel; inline persistent success/error; disabled Save while running.

## 3. Global Back Navigation (§2)

- `AppShell` header shows Back on any non-root route when `window.history.length > 1`; uses `router.history.back()` with contextual fallback map (feed/closet/saved/etc.).
- Feed tab + scroll: persist `{tab, scrollY}` per route in `sessionStorage`, restore on mount.
- Same for Shop filters and Style subtab.

## 4. Saved Outfits (§3)

- Convert `/generate` into `/style` with segmented subnav: `Create` (current generate UI), `Saved` (new), `Swipe` (move from bottom tab — bottom tab still shows Style; Swipe becomes subtab). Bottom nav unchanged otherwise.
- `Saved` list: filters (All, Favorites, Private, Shared, Recently worn, Never worn), collage cover using signed URLs, actions: open, rename, pin, visibility toggle, share/copy, mark worn, edit (swap piece), duplicate, delete.
- Detail route `_authenticated/saved.$id.tsx` with wear history and piece swap.
- Home preview strip + "View all" link.

## 5. Wear History Correction (§4)

- Wear history list on item and saved outfit detail pages (dates, source: outfit vs item, delete/edit-date buttons).
- Undo toast right after Mark Worn (calls the appropriate remove RPC).
- Remove direct `times_worn` increment path; route everything through RPCs.

## 6. Shop Performance & Layout (§5, §6)

- Query: `select id,name,brand,category,color,current_price,original_price,condition,image_url,formality,season,retailer,buy_url,is_demo,kind` with `.eq('active', true).limit(16)`; `Load more` paginates.
- Parallel fetch closet summary + first page; score only fetched slice; memoize per filter+seed; sessionStorage cache.
- Layout: responsive container `max-w-6xl`; grid `sm:grid-cols-2 lg:grid-cols-3`; toolbar rows (Items/Outfit → Category → Condition → Refresh right-aligned); mobile chips scroll with hidden scrollbar; skeleton cards; lazy `<img loading="lazy" width height>`.
- `Shop the outfit` subtab: pair one recommended item with 2–4 owned pieces; badges Owned/Recommended; `Save outfit idea` writes `saved_outfits` with a `shopping_idea` flag + linked catalog_id (add column).

## 7. Small Upgrades (§7)

- `Plan this outfit`: date picker on saved outfit → sets `planned_for`; Home shows upcoming.
- `Closet issues`: computed list on Profile flagging missing size/color/category + duplicate detection (brand+color+category).
- `Pin favorites`: pin button; pinned items get +0.05 in generator scoring.
- `Recently viewed`: sessionStorage ring buffer, shown on Home.

## 8. QA

- Bun tests for new helpers (archive filter, wear removal math, shop cache key, back-nav fallback map).
- Playwright E2E: edit item flow, back nav Feed↔detail with scroll, Saved outfit lifecycle, wear undo, Shop layout at 1440/390.
- Report exact `bun test` / `bun run build` / `bun run lint` output.

## Delivery Order

1. Migration + RPCs
2. Closet edit + archive
3. Back nav + scroll restore
4. Saved Outfits section + Style subnav
5. Wear history UI + Undo
6. Shop layout/perf + Shop the outfit
7. Small upgrades
8. Tests + E2E report

## Risks / Assumptions

- Moving Swipe under Style (bottom-nav still 6 tabs, Style contains Create/Saved/Swipe). If you want Swipe to stay a bottom tab, say so.
- `Plan this outfit` is a simple date field, no calendar integration.
- Shop timing will be measured locally, no invented numbers.
- Duplicate detection is heuristic (brand+color+category), not vision-based.

Approve and I'll ship in the order above, verifying each chunk before moving on.
