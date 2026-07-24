import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";

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
  notes: string | null;
};

const SEASONS = ["spring", "summer", "fall", "winter", "all"] as const;
const PROJECTION = ["", "soft", "moderate", "strong"] as const;
const LONGEVITY = ["", "short", "moderate", "long", "very long"] as const;
const OCCASIONS = [
  "work",
  "date",
  "church",
  "brunch",
  "gym",
  "errands",
  "party",
  "travel",
  "formal",
  "outdoor",
];

const empty: Omit<Fragrance, "id"> = {
  name: "",
  brand: "",
  family: "",
  top_notes: [],
  heart_notes: [],
  base_notes: [],
  season: "all",
  projection: "",
  longevity: "",
  occasions: [],
  notes: "",
};

function ScentsPage() {
  const [scents, setScents] = useState<Fragrance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<
    Fragrance | (Omit<Fragrance, "id"> & { id?: string }) | null
  >(null);
  const [uid, setUid] = useState<string | null>(null);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const u = userData.user?.id ?? null;
    setUid(u);
    if (!u) return;
    const { data } = await supabase
      .from("fragrances")
      .select(
        "id,name,brand,family,top_notes,heart_notes,base_notes,season,projection,longevity,occasions,notes",
      )
      .eq("user_id", u)
      .order("name");
    setScents((data ?? []) as Fragrance[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!editing || !uid) return;
    const name = editing.name.trim();
    if (!name) return toast.error("Name required");
    const payload = {
      user_id: uid,
      name,
      brand: editing.brand || null,
      family: editing.family || null,
      top_notes: editing.top_notes,
      heart_notes: editing.heart_notes,
      base_notes: editing.base_notes,
      season: editing.season as "all" | "fall" | "spring" | "summer" | "winter",
      projection: editing.projection || null,
      longevity: editing.longevity || null,
      occasions: editing.occasions,
      notes: editing.notes || null,
    };
    const q =
      "id" in editing && editing.id
        ? supabase.from("fragrances").update(payload).eq("id", editing.id)
        : supabase.from("fragrances").insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditing(null);
    void load();
  }

  async function del(id: string) {
    if (!confirm("Delete this fragrance?")) return;
    const { error } = await supabase.from("fragrances").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">Fragrance shelf</p>
          <h1 className="mt-1 font-display text-4xl">Scents</h1>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="btn-lime inline-flex items-center gap-1 !px-4 !py-2 text-xs"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : scents.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          No fragrances yet. Add one so DRIP can pair scents with outfits.
        </div>
      ) : (
        <ul className="space-y-3">
          {scents.map((s) => (
            <li key={s.id} className="card-surface p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl">{s.name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(s)}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => del(s.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {s.brand && (
                <p className="text-xs text-muted-foreground">
                  {s.brand} · {s.family ?? "—"}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-widest">
                {s.projection && <Tag>Proj: {s.projection}</Tag>}
                {s.longevity && <Tag>Long: {s.longevity}</Tag>}
                {s.season && <Tag>{s.season}</Tag>}
                {s.occasions.map((o) => (
                  <Tag key={o}>{o}</Tag>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center">
          <div className="card-surface w-full max-w-md space-y-3 p-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">
                {"id" in editing && editing.id ? "Edit" : "Add"} scent
              </h2>
              <button onClick={() => setEditing(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Text
              label="Name*"
              value={editing.name}
              onChange={(v) => setEditing({ ...editing, name: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Text
                label="Brand"
                value={editing.brand ?? ""}
                onChange={(v) => setEditing({ ...editing, brand: v })}
              />
              <Text
                label="Family"
                value={editing.family ?? ""}
                onChange={(v) => setEditing({ ...editing, family: v })}
                placeholder="woody, fresh…"
              />
            </div>
            <NoteList
              label="Top notes"
              value={editing.top_notes}
              onChange={(v) => setEditing({ ...editing, top_notes: v })}
            />
            <NoteList
              label="Heart notes"
              value={editing.heart_notes}
              onChange={(v) => setEditing({ ...editing, heart_notes: v })}
            />
            <NoteList
              label="Base notes"
              value={editing.base_notes}
              onChange={(v) => setEditing({ ...editing, base_notes: v })}
            />
            <div className="grid grid-cols-3 gap-3">
              <SelectF
                label="Season"
                value={editing.season}
                options={[...SEASONS]}
                onChange={(v) => setEditing({ ...editing, season: v })}
              />
              <SelectF
                label="Projection"
                value={editing.projection ?? ""}
                options={[...PROJECTION]}
                onChange={(v) => setEditing({ ...editing, projection: v })}
              />
              <SelectF
                label="Longevity"
                value={editing.longevity ?? ""}
                options={[...LONGEVITY]}
                onChange={(v) => setEditing({ ...editing, longevity: v })}
              />
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Occasions
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {OCCASIONS.map((o) => {
                  const on = editing.occasions.includes(o);
                  return (
                    <button
                      key={o}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          occasions: on
                            ? editing.occasions.filter((x) => x !== o)
                            : [...editing.occasions, o],
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={save} className="btn-lime w-full">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 outline-none focus:border-primary text-sm";
function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
        maxLength={100}
      />
    </label>
  );
}
function SelectF({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
function NoteList({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        className={inputCls}
        placeholder="comma, separated"
      />
    </label>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-foreground/80">
      {children}
    </span>
  );
}
