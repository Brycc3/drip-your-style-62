import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/scents")({
  head: () => ({
    meta: [
      { title: "Scents — DRIP" },
      { name: "description", content: "Your fragrance shelf, tagged and pairable." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScentsPage,
});

type Fragrance = {
  id: string;
  name: string;
  brand: string | null;
  family: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  season: string;
  projection: string | null;
  longevity: string | null;
  occasions: string[];
};

function ScentsPage() {
  const [scents, setScents] = useState<Fragrance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fragrances")
        .select("id,name,brand,family,top_notes,heart_notes,base_notes,season,projection,longevity,occasions")
        .order("name");
      setScents((data ?? []) as Fragrance[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Fragrance shelf</p>
        <h1 className="mt-1 font-display text-4xl">Scents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seeded library for now. Phase 4 pairs a scent to each outfit and explains why.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : scents.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          No fragrances seeded yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {scents.map((s) => (
            <li key={s.id} className="card-surface p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl">{s.name}</h3>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {s.family}
                </span>
              </div>
              {s.brand && <p className="text-xs text-muted-foreground">{s.brand}</p>}
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Stat label="Top" val={(s.top_notes ?? []).slice(0, 2).join(", ")} />
                <Stat label="Heart" val={(s.heart_notes ?? []).slice(0, 2).join(", ")} />
                <Stat label="Base" val={(s.base_notes ?? []).slice(0, 2).join(", ")} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest">
                {s.projection && <Tag>Proj: {s.projection}</Tag>}
                {s.longevity && <Tag>Long: {s.longevity}</Tag>}
                {s.season && <Tag>{s.season}</Tag>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, val }: { label: string; val: string }) {
  return (
    <div>
      <div className="text-[9px] text-primary">{label}</div>
      <div className="mt-0.5 normal-case tracking-normal text-foreground/85 text-xs">{val || "—"}</div>
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-foreground/80">
      {children}
    </span>
  );
}
