## What I checked (read-only)

- Sandbox env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (and service role) are all **present now**. `/dev-server/.env` exists and was **rewritten at 02:50 today** — the dev-server log shows `.env changed, restarting server...` at 02:50:51.
- Local runtime: `GET /auth`, `/auth?mode=signin`, `/auth?mode=login` all return **200**. A headless browser load of `/auth` renders the full sign-in form with **zero console errors and zero page errors**. No server-function or import error occurs.
- Route graph: only one auth route pair (`auth.tsx`, `auth_.reset-password.tsx`) — no duplicate/conflicting route.
- Deployed preview logs: the preview worker is serving build SHA **36d7381e**; only `/` requests appear (200). Hosted `/auth` can't be fetched externally because the unpublished preview sits behind the Lovable login wall.
- Git: local `HEAD` is `d422153b4cf...` ("Changes"), whose parent is **`36d7381ea71aadd181f4072c4d25e8c29ff3ac6e`**. So yes — the GitHub-connected `main` commit is `36d7381e...`, and the sandbox is one commit ahead of it.

## Exact runtime error

There is **no reproducible error in the current sandbox runtime** — `/auth` is healthy at the latest code. The failure the user saw comes from the **deployed preview build at `36d7381e`, which was built while `.env` was absent**.

The thrown error is the one in the auto-generated `src/integrations/supabase/client.ts`:

```text
Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Connect Supabase in Lovable Cloud.
```

Why it surfaces specifically on Sign In: `/auth` is `ssr: false` and its very first client action is `supabase.auth.getSession()`. `import.meta.env.VITE_SUPABASE_*` is inlined **at build time**; with `.env` removed from the repo, that build inlined `undefined`, the proxy client throws on first property access, the root `errorComponent` catches it, and the user gets "This page didn't load…". Public/legal/landing routes don't touch Supabase, which is why only Sign In breaks.

## Safest repair path (no code changes needed)

1. `.env` is already restored in the sandbox with all four variables — nothing to edit. Keep `.env` git-ignored; the platform injects it. Do **not** commit keys.
2. **Rebuild/redeploy the preview** from the current sandbox state so the client bundle re-inlines `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. This is the entire fix.
3. Verify after redeploy: open `/auth` in the preview, confirm the form renders and the browser console is clean, then complete one email sign-in.
4. If the variables were ever genuinely unbound (they are not right now), the recovery tool is the Supabase secret rebind, followed by a dev-server restart — not a code workaround.

## Optional hardening (only if you want it, separate change)

Give `/auth` its own `errorComponent` that names configuration failures explicitly ("Sign-in is temporarily unavailable — backend not configured") instead of falling through to the generic root error page. This is cosmetic; it does not affect the fix above.

No files edited, no migrations applied, no deploys, no commits were made during this diagnosis.
