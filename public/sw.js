/* DRIP offline shell. No authenticated HTML, APIs, photos, tokens or user data
 * enter Cache Storage. Deliberately not an offline-edit queue. */
const SHELL_CACHE = "drip-public-shell-v1";
const SHELL_FILES = ["/offline.html", "/icon-192.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("drip-public-shell-") && key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Never cache or replay URL credentials (OAuth / recovery included).
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match("/offline.html", { cacheName: SHELL_CACHE });
        return (
          shell ||
          new Response("DRIP is offline. Reconnect to continue.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
  } else if (!url.search && SHELL_FILES.includes(url.pathname)) {
    event.respondWith(
      caches
        .match(url.pathname, { cacheName: SHELL_CACHE })
        .then((cached) => cached || fetch(request)),
    );
  }
});
