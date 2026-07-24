import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("drip:install-dismissed") === "1") { setDismissed(true); return; }
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) { setDismissed(true); return; }
    const ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !("MSStream" in window);
    setIsIOS(ios);
    if (ios) setShowIOS(true);
    const handler = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function close() {
    localStorage.setItem("drip:install-dismissed", "1");
    setDismissed(true); setShowIOS(false); setEvt(null);
  }

  if (dismissed) return null;
  if (!evt && !(isIOS && showIOS)) return null;

  return (
    <div className="fixed bottom-24 inset-x-3 z-40 rounded-2xl border border-primary/40 bg-surface p-4 shadow-lg">
      <button onClick={close} className="absolute right-2 top-2 text-muted-foreground"><X className="h-4 w-4" /></button>
      <p className="text-xs uppercase tracking-widest text-primary">Install DRIP</p>
      {evt ? (
        <>
          <p className="mt-1 text-sm">Get one-tap access from your home screen.</p>
          <button onClick={async () => { await evt.prompt(); await evt.userChoice; close(); }}
            className="btn-lime mt-3 inline-flex items-center gap-2 !py-2 text-xs">
            <Download className="h-4 w-4" /> Install
          </button>
        </>
      ) : (
        <p className="mt-1 text-sm">Tap <Share className="inline h-4 w-4 align-text-bottom" /> Share, then <span className="text-primary">Add to Home Screen</span>.</p>
      )}
    </div>
  );
}
