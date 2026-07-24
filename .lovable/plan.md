
## Immediate fix (ships with Phase 2)

**Sign-in for Google accounts.** When email/password login returns `invalid_credentials`, silently probe whether the email has a Google identity and swap the error toast for: *"This email uses Google sign-in. Click Continue with Google."* Also detect "not confirmed" and route to a resend-confirmation action. No new tables.

**Add-a-piece bug.** Once I can see the exact error (screenshot or toast text — I'll add better logging), I'll fix it as part of this batch. Most likely the onboarding gate is bouncing you back before the form saves.

---

## Phase 2 — Outfit generator + Social

### 2A. Outfit generator (original plan)
Rule-based scorer that reads your closet and returns 3–5 outfit cards for a given occasion.

- New page: `/generate` becomes interactive (form → cards).
- Inputs: where you're going, vibe, temperature, dress code.
- Scorer factors: color harmony (complementary + neutral anchors), silhouette balance (fitted vs. relaxed), season/temperature, formality match, stated style prefs from onboarding, swipe feedback signal (once 2B ships), diversity vs. recent wears.
- Each card shows the pieces, a plain-English rationale ("navy bomber anchors the warm-tone tee; joggers keep the silhouette relaxed for 55°F casual"), and buttons: **Save**, **Regenerate**, **Mark worn**.
- Persists to `saved_outfits` + `outfit_items` (already exist).

### 2B. Social sharing + public profiles
Opt-in. Default = private.

- New table `public_profiles` — handle, display name, bio, avatar, is_public flag.
- Handle claim flow in `/profile` ("Make my profile public → choose @handle").
- New public route `/u/$handle` — visible to anyone, shows public outfits + likes count + follow button. Own `head()` with OG image = user's top outfit.
- `saved_outfits` gets a `visibility` column: `private | friends | public`.
- Share-sheet on any saved outfit → copy link `/o/$outfitId` (public route, owner-controlled visibility).

### 2C. Friends
- `follows` table (follower_id → followee_id). Simple, no accept step (Pinterest-style).
- Optional `friend_requests` for accept-required "friends-only" outfits.
- `/profile/friends` — search by handle, follow/unfollow, see who follows you.
- Friends-only outfits visible to accepted followers.

### 2D. Global leaderboard
Public route `/leaderboard` — Pinterest/Reddit-style grid of public outfits.

- Tabs: **Trending** (likes in last 7d, decayed), **Top all-time**, **New**.
- Also `/leaderboard/users` — top public profiles by total likes.
- New tables: `outfit_likes` (user, outfit, created_at), `outfit_saves` (Pinterest-style save-to-inspo), `outfit_comments` (Reddit-style with parent_id for threads).
- Rate-limit likes/comments via RLS + insert throttling.
- Each outfit card links to `/o/$outfitId` which shows fullscreen image, breakdown of pieces, comments thread, like/save buttons.

### 2E. Inspo board (comes with saves)
- New `/inspo` page under the auth gate — grid of outfits you've saved from others' feeds.

---

## Nav changes
Bottom tab bar gains a **Feed** (leaderboard) tab. Profile page gets: *Make public*, *Friends*, *My inspo*, *Shared with me*.

---

## Technical details

- **Auth fix:** call `supabase.auth.signInWithPassword`; on `invalid_credentials`, call a public server fn `checkEmailProviders(email)` that uses `supabaseAdmin` to look up identities and returns `{ hasGoogle, hasPassword, confirmed }`. Toast copy chosen from that.
- **Public routes** (`/u/$handle`, `/o/$id`, `/leaderboard`) are top-level SSR-enabled with loaders calling **public server fns** using the server publishable client + narrow `TO anon` SELECT policies (only rows where `visibility='public'`; only public-profile columns).
- **Private/friends reads** go through `requireSupabaseAuth` server fns with owner + follower policies.
- **Likes/saves/comments tables** all have GRANTs to authenticated + service_role, RLS scoped to `auth.uid()` for writes, and `TO anon` reads for public outfits only.
- **Leaderboard scoring** = SQL view: `likes * exp(-age_hours/72)` for trending; `count(likes)` for top; `created_at desc` for new.
- **OG images** for `/u/$handle` and `/o/$id` use the outfit cover image URL directly — no image generation needed for MVP.
- **Migrations** ship in one batch: `public_profiles`, `follows`, `outfit_likes`, `outfit_saves`, `outfit_comments`, add `visibility` + `share_slug` to `saved_outfits`, add `is_public` + `handle` to `profiles` (or via new `public_profiles` table).
- **Recommendation engine** stays rule-based and transparent per your original spec; no AI branding.

---

## What I'll ship in this turn

1. Sign-in fix + better error copy.
2. Debug + fix add-a-piece.
3. All Phase 2 migrations (tables, RLS, GRANTs).
4. Outfit generator working end-to-end.
5. Public profile claim + `/u/$handle` + share links.
6. `/leaderboard` with trending/top/new + likes + comments + saves.
7. Feed tab in nav, Friends + Inspo in Profile.

Phase 3 (advanced swipe training feeding back into the scorer) and Phase 4 (deeper scent pairing + analytics + offline polish) still come after.
