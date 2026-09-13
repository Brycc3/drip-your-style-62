# Isolated UI review — not staging

From the repository root, after `npm ci`:

```sh
npx vite --config scripts/visual-review/vite.config.mjs
```

Open `http://127.0.0.1:4175/shop`. This harness renders the actual route components but
replaces Supabase with a deliberately limited in-memory fixture client. There is no authenticated
session, live inventory, provider exchange or durable database. A reload resets all fixture edits.
Server actions and destructive actions are blocked. It is excluded from the production app entry.

Supported routes: `/home`, `/closet`, `/generate`, `/shop`, `/inspo`, `/saved`, `/swipe`,
`/taste`, `/scents`, `/profile`, plus the actual static `/offline.html`.
Fixtures reuse the existing original catalog illustrations as simulated wardrobe images, not
as evidence of a real person's closet. Feed is empty; real feed covers need backend verification.
Other routes require the real application and a confirmed isolated backend.

Reload with `?fixture=error` to make reads fail, `?fixture=empty` for no closet items,
or `?fixture=image-error` for one deliberately broken owned image.

For before screenshots, the same harness can use a detached baseline checkout:

```sh
DRIP_REVIEW_BASELINE=/absolute/path/to/baseline DRIP_REVIEW_PORT=4176 npx vite --config scripts/visual-review/vite.config.mjs
```

The recorded baseline was `02b5450b76c38b3829f6699e2c25da57093f93fd` (the history-preserving
main merge, before launch-candidate implementation). Do not use this harness as proof of RLS,
real persistence, auth, upload cleanup, SSR, or service-worker installation.
