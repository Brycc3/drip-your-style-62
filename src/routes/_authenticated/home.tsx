import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import { Shirt, Sparkles, ShoppingBag, TrendingUp, Bookmark } from "lucide-react";
import {
  computeStarterProgress,
  starterCountsFromItems,
  type StarterCounts,
} from "@/lib/starter-progress";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — DRIP" },
      { name: "description", content: "Today's outfit, closet snapshot, and what to wear next." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomePage,
});

type Counts = StarterCounts & { total: number; outer: number; fragrances: number };

function HomePage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [recent, setRecent] = useState<
    Array<{ id: string; name: string; image_url: string | null; color: string | null }>
  >([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;

      const [{ data: profile }, { data: items }, { count: fragCount }, { data: recentItems }] =
        await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
          supabase.from("closet_items").select("id,category,kind").eq("user_id", uid),
          supabase
            .from("fragrances")
            .select("*", { count: "exact", head: true })
            .eq("user_id", uid),
          supabase
            .from("closet_items")
            .select("id,name,image_url,color")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(6),
        ]);
      setDisplayName(profile?.display_name ?? "");
      if (items) {
        const starter = starterCountsFromItems(items);
        const c: Counts = {
          total: items.length,
          tops: starter.tops,
          bottoms: starter.bottoms,
          shoes: starter.shoes,
          outer: 0,
          accessories: starter.accessories,
          fragrances: fragCount ?? 0,
        };
        for (const i of items) {
          if (["outerwear", "bomber", "chore", "jacket", "coat"].includes(i.category)) c.outer++;
        }
        setCounts(c);
      }
      const list = recentItems ?? [];
      setRecent(list);
      if (list.length) setUrls(await getSignedUrlsByItem(list));
    })();
  }, []);

  const empty = counts && counts.total === 0;
  const progress = counts ? computeStarterProgress(counts) : null;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Welcome back</p>
        <h1 className="mt-1 font-display text-4xl">{displayName || "Get dressed"}</h1>
      </section>

      {empty ? (
        <EmptyState />
      ) : (
        <>
          {/* Show progress whenever ANY starter category is short — even if
              total items >= 7. Otherwise show the honest generator CTA. */}
          {progress && !progress.complete && <StarterProgress progress={progress} />}
          {progress?.generatorReady ? (
            <GeneratorCTA starterComplete={progress.complete} />
          ) : progress ? (
            <IncompleteGeneratorCTA progress={progress} />
          ) : null}

          <section>
            <h3 className="font-display text-xl">Your closet at a glance</h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Total" value={counts?.total ?? 0} />
              <Stat label="Tops" value={counts?.tops ?? 0} />
              <Stat label="Bottoms" value={counts?.bottoms ?? 0} />
              <Stat label="Shoes" value={counts?.shoes ?? 0} />
              <Stat label="Outer" value={counts?.outer ?? 0} />
              <Stat label="Scents" value={counts?.fragrances ?? 0} />
            </div>
          </section>

          {recent.length > 0 && (
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl">Recently added</h3>
                <Link
                  to="/closet"
                  className="text-xs uppercase tracking-widest text-muted-foreground"
                >
                  View all
                </Link>
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-3">
                {recent.map((r) => (
                  <li key={r.id} className="card-surface aspect-square overflow-hidden text-xs">
                    {urls[r.id] ? (
                      <img
                        src={urls[r.id]}
                        alt={r.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-2">
                        <span className="line-clamp-2 text-center text-foreground/80">
                          {r.name}
                        </span>
                        <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                          {r.color || ""}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3">
            <QuickLink to="/closet" icon={Shirt} label="Closet" />
            <QuickLink to="/saved" icon={Bookmark} label="Saved outfits" />
            <QuickLink to="/generate" icon={Sparkles} label="Generate" />
            <QuickLink to="/shop" icon={ShoppingBag} label="Shop gaps" />
            <QuickLink to="/swipe" icon={TrendingUp} label="Train taste" />
          </section>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-surface p-6 text-center">
      <h2 className="font-display text-2xl">Your closet is empty</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Add a few pieces to unlock outfits, gap analysis, and scent pairings.
      </p>
      <Link to="/closet/new" className="btn-lime mt-5 inline-flex">
        Add your first piece
      </Link>
      <Link
        to="/saved"
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs uppercase tracking-widest"
      >
        <Bookmark className="h-3.5 w-3.5" /> Saved outfits
      </Link>
    </div>
  );
}

type ProgressData = ReturnType<typeof computeStarterProgress>;

function StarterProgress({ progress }: { progress: ProgressData }) {
  return (
    <section className="card-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">Starter closet</p>
          <h2 className="mt-1 font-display text-2xl">3-2-2 to unlock outfits</h2>
        </div>
        <span className="font-display text-2xl text-primary">
          {progress.filled}/{progress.goal}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${progress.percent}%` }}
          aria-label={`${progress.percent}% complete`}
        />
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {progress.targets.map((t) => {
          const done = t.have >= t.need;
          return (
            <li key={t.label} className="flex items-center justify-between">
              <span className={done ? "text-foreground/90" : "text-muted-foreground"}>
                {t.label}
              </span>
              <span className={done ? "text-primary" : "text-muted-foreground"}>
                {Math.min(t.have, t.need)}/{t.need}
                {t.have > t.need ? ` (+${t.have - t.need})` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <Link to="/closet/new" className="btn-lime mt-4 inline-flex !py-2 text-xs">
        Add a piece
      </Link>
    </section>
  );
}

function IncompleteGeneratorCTA({ progress }: { progress: ProgressData }) {
  const missing = progress.missingCoreCategories.map((target) => target.label.toLowerCase());
  return (
    <section className="card-surface p-5 border border-primary/20">
      <p className="text-xs uppercase tracking-widest text-primary">Core outfit missing</p>
      <h2 className="mt-1 font-display text-2xl">
        Add {new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(missing)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A usable outfit needs at least one top, one bottom, and one pair of shoes. Add the missing
        categories before generating.
      </p>
      <Link to="/closet/new" className="btn-lime mt-4 inline-flex">
        Add missing piece
      </Link>
    </section>
  );
}

function GeneratorCTA({ starterComplete }: { starterComplete: boolean }) {
  return (
    <section className="card-surface p-5">
      <p className="text-xs uppercase tracking-widest text-primary">Today&apos;s move</p>
      <h2 className="mt-1 font-display text-2xl">Generate a fit</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {starterComplete
          ? "Tell DRIP the vibe and weather — it builds an outfit from your closet."
          : "Your closet has the core categories needed to build an outfit. Keep working toward 3-2-2 for more variety."}
      </p>
      <Link to="/generate" className="btn-lime mt-4 inline-flex">
        Open generator
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-surface p-3 text-center">
      <div className="font-display text-3xl text-primary">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link to={to} className="card-surface flex items-center gap-3 p-4">
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-sm uppercase tracking-widest">{label}</span>
    </Link>
  );
}
