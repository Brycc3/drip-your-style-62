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

The production build registers `public/sw.js`, caching only the project-owned
offline page and icon. Navigations are network-first with an honest reconnect
screen when offline. Private pages, API responses, signed images and auth URLs
are never cached. Edits/uploads are not queued. First-ever visits still need a
connection to install the shell. Device installation and recovery require staging
verification; a manifest alone is not proof of installability on every browser.

Use `?sw=off` to unregister DRIP's worker and clear only its shell caches.
See [launch candidate evidence and preview instructions](docs/launch-candidate/README.md).
