import { useEffect, useState } from "react";

export function ConnectionStatus() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator) {
      const setting = new URLSearchParams(window.location.search).get("sw");
      if (setting === "off") {
        void navigator.serviceWorker
          .getRegistrations()
          .then(async (registrations) => {
            for (const r of registrations)
              if (r.active?.scriptURL === `${window.location.origin}/sw.js`) await r.unregister();
            for (const key of await caches.keys())
              if (key.startsWith("drip-public-shell-")) await caches.delete(key);
          })
          .catch(() => {
            // Restricted storage must not crash the online application.
          });
      } else if (import.meta.env.PROD) {
        void navigator.serviceWorker
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
          .catch(() => {
            // Installation is optional; online use remains available if it fails.
          });
      }
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? (
    <div role="status" className="border-b border-primary/40 bg-surface p-3 text-center text-sm">
      You’re offline. Changes aren’t queued — reconnect before saving or uploading.
    </div>
  ) : null;
}
