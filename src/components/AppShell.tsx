import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Home, Shirt, Sparkles, Flame, ShoppingBag, FlaskConical, User } from "lucide-react";
import { InstallPrompt } from "./InstallPrompt";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/closet", label: "Closet", icon: Shirt },
  { to: "/generate", label: "Generate", icon: Sparkles },
  { to: "/feed", label: "Feed", icon: Flame },
  { to: "/shop", label: "Shop", icon: ShoppingBag },
  { to: "/scents", label: "Scents", icon: FlaskConical },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="safe-t sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container-app flex h-14 items-center justify-between">
          <Link to="/home" className="font-display text-2xl tracking-widest text-foreground">
            DRIP<span className="text-primary">.</span>
          </Link>
          <Link to="/profile" className="text-xs uppercase tracking-widest text-muted-foreground">
            Account
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-28">
        <div className="container-app py-5">{children}</div>
      </main>

      <nav className="safe-b fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="container-app">
          <ul className="grid grid-cols-7 py-2">
            {tabs.map((t) => {
              const active = pathname === t.to || pathname.startsWith(t.to + "/");
              const Icon = t.icon;
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    className={`flex flex-col items-center gap-0.5 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
                    <span className="hidden sm:inline">{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
}
