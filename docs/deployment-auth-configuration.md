# Deployment and authentication configuration

DRIP supports both Vite-prefixed browser variables and server aliases:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The real `.env` stays ignored and untracked. Do not add a service-role key, secret API key, real URL,
or real publishable key to Git, Lovable prompts, CI YAML, screenshots, or issue comments.

## Lovable and preview deployment

Configure the four public settings in Lovable's environment/secret settings, not in repository
files. Rebuild after changing Vite-prefixed variables because Vite replaces them at build time.
Confirm the current preview URL is present in Supabase Authentication URL Configuration before
testing sign-in.

The repository does not define the preview or future production hostname. Add each actual hostname
only when it is assigned, using HTTPS.

## Supabase redirect allowlist

For every approved preview and future production origin, configure:

- `<origin>/auth/reset-password` for PASSWORD_RECOVERY callbacks;
- `<origin>/onboarding` for email confirmation and first-run onboarding;
- `<origin>` for the Google OAuth return.

Also configure the matching Google OAuth redirect/provider settings in Supabase and Google Cloud.
Do not use wildcard production redirects.

## Release verification

On the deployed preview, verify email sign-up, email sign-in, Google OAuth, confirmation resend,
forgot password, a real `PASSWORD_RECOVERY` reset callback, an invalid/expired callback, and sign-out.
An ordinary signed-in session or raw URL token/code must never unlock the reset form.

When public configuration is absent, `/auth` intentionally renders:

> Sign-in is temporarily unavailable because the backend configuration is missing.

The message never displays configuration values. Fix the deployment settings and rebuild; do not
work around it with committed credentials.
