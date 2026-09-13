import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Home, Shirt, Sparkles, Flame, ShoppingBag, User, ArrowLeft } from "lucide-react";
import { InstallPrompt } from "./InstallPrompt";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/closet", label: "Closet", icon: Shirt },
  { to: "/generate", label: "Create", icon: Sparkles },
  { to: "/shop", label: "Shop", icon: ShoppingBag },
  { to: "/feed", label: "Feed", icon: Flame },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const PRIMARY_PATHS = new Set(tabs.map((t) => t.to as string));

// Contextual fallback when browser history has no in-app entry.
function fallbackFor(pathname: string): string {
  if (pathname.startsWith("/closet/")) return "/closet";
  if (pathname === "/saved" || pathname.startsWith("/saved/")) return "/generate";
  if (pathname === "/taste" || pathname === "/inspo" || pathname === "/swipe") return "/generate";
  if (pathname.startsWith("/o/")) return "/feed";
  if (pathname.startsWith("/u/")) return "/feed";
  if (pathname.startsWith("/shop/")) return "/shop";
  return "/home";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const showBack = !PRIMARY_PATHS.has(pathname);

  function goBack() {
    // Prefer real history for scroll/state; fallback contextually.
    if (typeof window !== "undefined" && Number(window.history.state?.__TSR_index) > 0) {
      router.history.back();
    } else {
      router.navigate({ to: fallbackFor(pathname) });
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="safe-t sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container-wide flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {showBack && (
              <button
                onClick={goBack}
                aria-label="Back"
                className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/80 hover:bg-surface-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <Link
              to="/home"
              className="font-display text-2xl tracking-widest text-foreground truncate"
            >
              DRIP<span className="text-primary">.</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/shop"
              className="hidden md:inline-flex rounded-full border border-primary/40 px-4 py-2 text-sm text-primary"
            >
              Shop
            </Link>
            <Link to="/generate" className="hidden md:inline-flex btn-lime">
              Create an outfit
            </Link>
            <Link to="/profile" className="text-xs uppercase tracking-widest text-muted-foreground">
              Account
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-28">
        <div
          className={`${
            ["/shop", "/generate", "/inspo", "/saved"].includes(pathname) ||
            pathname.startsWith("/shop/")
              ? "container-wide"
              : "container-app"
          } py-5`}
        >
          {children}
        </div>
      </main>

      <nav className="safe-b fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="container-app">
          <ul className="grid grid-cols-6 py-2">
            {tabs.map((t) => {
              const active = pathname === t.to || pathname.startsWith(t.to + "/");
              const Icon = t.icon;
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 flex-col justify-center items-center gap-1 rounded-xl py-1 text-[10px] uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      active
                        ? "bg-primary/10 text-primary"
                        : t.to === "/shop" || t.to === "/generate"
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
                    <span>{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <InstallPrompt />
    </div>
  );
}
