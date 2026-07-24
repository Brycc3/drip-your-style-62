import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { uploadClosetImage } from "@/lib/closet-storage";
import { toast } from "sonner";
import { Camera } from "lucide-react";

export const Route = createFileRoute("/_authenticated/closet/new")({
  head: () => ({
    meta: [
      { title: "Add a piece — DRIP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewItem,
});

const CATEGORIES = ["top", "bottom", "outerwear", "shoes", "accessory", "fragrance"] as const;
const MATERIALS = ["Cotton", "Wool", "Denim", "Leather", "Nylon", "Fleece", "Linen", "Synthetic", "Suede", "Other"] as const;
const FITS = ["Slim", "Regular", "Relaxed", "Oversized", "Boxy", "Cropped"] as const;
const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;
const FORMALITY = ["casual", "smart-casual", "business", "formal", "athletic"] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Name it").max(80),
  category: z.enum(CATEGORIES),
  brand: z.string().trim().max(60).optional().or(z.literal("")),
  primary_color: z.string().trim().max(30).optional().or(z.literal("")),
  material: z.string().trim().max(60).optional().or(z.literal("")),
  fit: z.string().trim().max(30).optional().or(z.literal("")),
  size: z.string().trim().max(20).optional().or(z.literal("")),
  price: z.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

function NewItem() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    category: "top" as (typeof CATEGORIES)[number],
    brand: "",
    primary_color: "",
    material: "",
    fit: "",
    size: "",
    price: "",
    notes: "",
  });
  const [seasons, setSeasons] = useState<string[]>([]);
  const [formality, setFormality] = useState<string>("casual");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error("Image too large (max 8MB)");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function save() {
    const parsed = schema.safeParse({
      ...form,
      price: form.price ? Number(form.price) : undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      let image_path: string | null = null;
      if (file) image_path = await uploadClosetImage(uid, file);

      const { error } = await supabase.from("closet_items").insert({
        user_id: uid,
        name: parsed.data.name,
        category: parsed.data.category,
        brand: parsed.data.brand || null,
        primary_color: parsed.data.primary_color || null,
        material: parsed.data.material || null,
        fit: parsed.data.fit || null,
        size: parsed.data.size || null,
        price: parsed.data.price ?? null,
        notes: parsed.data.notes || null,
        seasons,
        formality,
        image_path,
      });
      if (error) throw error;
      toast.success("Added to your closet");
      navigate({ to: "/closet" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">New piece</p>
        <h1 className="mt-1 font-display text-3xl">Add to closet</h1>
      </div>

      <label className="card-surface flex aspect-[3/2] cursor-pointer items-center justify-center overflow-hidden">
        {preview ? (
          <img src={preview} alt="preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <span className="text-xs uppercase tracking-widest">Add photo</span>
          </div>
        )}
        <input type="file" accept="image/*" onChange={onFile} className="hidden" />
      </label>

      <Field label="Name*">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Black heavyweight tee" maxLength={80} />
      </Field>

      <Field label="Category*">
        <Select value={form.category} onChange={(v) => setForm({ ...form, category: v as (typeof CATEGORIES)[number] })} options={[...CATEGORIES]} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand">
          <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={inputCls} maxLength={60} />
        </Field>
        <Field label="Color">
          <input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className={inputCls} maxLength={30} placeholder="Black" />
        </Field>
        <Field label="Material">
          <Select value={form.material} onChange={(v) => setForm({ ...form, material: v })} options={["", ...MATERIALS]} />
        </Field>
        <Field label="Fit">
          <Select value={form.fit} onChange={(v) => setForm({ ...form, fit: v })} options={["", ...FITS]} />
        </Field>
        <Field label="Size">
          <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className={inputCls} maxLength={20} />
        </Field>
        <Field label="Price ($)">
          <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className={inputCls} />
        </Field>
      </div>

      <Field label="Seasons">
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeasons((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                seasons.includes(s) ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Formality">
        <Select value={formality} onChange={setFormality} options={[...FORMALITY]} />
      </Field>

      <Field label="Notes">
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} maxLength={500} />
      </Field>

      <button onClick={save} disabled={saving} className="btn-lime w-full disabled:opacity-50">
        {saving ? "Saving…" : "Save piece"}
      </button>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-input px-3 py-2.5 outline-none focus:border-primary text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o || "—"}
        </option>
      ))}
    </select>
  );
}
