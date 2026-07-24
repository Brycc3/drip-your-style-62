# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## PWA & Offline (current status)

DRIP ships a valid Web App Manifest, theme color, and install prompt with iOS
"Add to Home Screen" instructions, so it is installable on Android/desktop
Chrome and iOS Safari. **There is no service worker yet**, which means:

- No offline app shell — cold-load without network shows the browser error.
- Signed image URLs and Supabase reads always require connectivity.
- "Full offline edits" from the product brief are still Phase 2.

A hand-rolled `public/sw.js` with a network-first HTML strategy and cache-first
hashed assets (excluding the OAuth callback) is planned; registration will be
gated to production origins and support `?sw=off` for debugging.
