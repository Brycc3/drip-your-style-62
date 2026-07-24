import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles, Layers, HandMetal, Bookmark, Heart } from "lucide-react";

const TABS = [
  { to: "/generate", label: "Create", icon: Sparkles },
  { to: "/inspo", label: "Inspo Builder", icon: Layers },
  { to: "/swipe", label: "Swipe", icon: HandMetal },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/taste", label: "Taste", icon: Heart },
] as const;

export function StyleTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Style sections"
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide"
    >
      {TABS.map((t) => {
        const active = pathname === t.to;
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs uppercase tracking-widest transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80 hover:bg-surface-2"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
