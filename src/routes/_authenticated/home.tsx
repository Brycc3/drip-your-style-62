import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrlsByItem } from "@/lib/closet-storage";
import { Shirt, Sparkles, ShoppingBag, TrendingUp } from "lucide-react";

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

type Counts = { total: number; tops: number; bottoms: number; shoes: number; outer: number; accessories: number; fragrances: number };

function HomePage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [recent, setRecent] = useState<Array<{ id: string; name: string; image_url: string | null; color: string | null }>>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;

      const [{ data: profile }, { data: items }, { count: fragCount }, { data: recentItems }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
        supabase.from("closet_items").select("id,category,kind").eq("user_id", uid),
        supabase.from("fragrances").select("*", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("closet_items").select("id,name,image_url,color").eq("user_id", uid).order("created_at", { ascending: false }).limit(6),
      ]);
      setDisplayName(profile?.display_name ?? "");
      if (items) {
        const c: Counts = { total: items.length, tops: 0, bottoms: 0, shoes: 0, outer: 0, accessories: 0, fragrances: fragCount ?? 0 };
        for (const i of items) {
          if (i.kind === "shoes") c.shoes++;
          else if (i.kind === "accessory") c.accessories++;
          else if (i.category === "top") c.tops++;
          else if (i.category === "bottom") c.bottoms++;
          else if (i.category === "outerwear") c.outer++;
        }
        setCounts(c);
      }
      setRecent(recentItems ?? []);
      const paths = (recentItems ?? []).map((r) => r.image_url).filter(Boolean) as string[];
      if (paths.length) setUrls(await getSignedUrls(paths));
    })();
  }, []);

  const empty = counts && counts.total === 0;

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
          <section className="card-surface p-5">
            <p className="text-xs uppercase tracking-widest text-primary">Today's move</p>
            <h2 className="mt-1 font-display text-2xl">Generate a fit</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell DRIP the vibe and weather — it builds an outfit from your closet.
            </p>
            <Link to="/generate" className="btn-lime mt-4 inline-flex">
              Open generator
            </Link>
          </section>

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
                <Link to="/closet" className="text-xs uppercase tracking-widest text-muted-foreground">
                  View all
                </Link>
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-3">
                {recent.map((r) => (
                  <li key={r.id} className="card-surface aspect-square overflow-hidden text-xs">
                    {urls[r.id] ? (
                      <img src={urls[r.id]} alt={r.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-2">
                        <span className="line-clamp-2 text-center text-foreground/80">{r.name}</span>
                        <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{r.color || ""}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3">
            <QuickLink to="/closet" icon={Shirt} label="Closet" />
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-surface p-3 text-center">
      <div className="font-display text-3xl text-primary">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link to={to} className="card-surface flex items-center gap-3 p-4">
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-sm uppercase tracking-widest">{label}</span>
    </Link>
  );
}
