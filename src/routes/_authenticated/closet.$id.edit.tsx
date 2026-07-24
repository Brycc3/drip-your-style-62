import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadClosetImage,
  deleteClosetImage,
  getSignedUrl,
} from "@/lib/closet-storage";
import type { Tables } from "@/integrations/supabase/types";
import { Camera, X } from "lucide-react";

type ClosetItem = Tables<"closet_items">;

export const Route = createFileRoute("/_authenticated/closet/$id/edit")({
  head: () => ({
    meta: [{ title: "Edit piece — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  component: EditItem,
});

const CATEGORIES = ["top", "bottom", "outerwear", "shoes", "accessory"] as const;
const MATERIALS = [
  "Cotton",
  "Wool",
  "Denim",
  "Leather",
  "Nylon",
  "Fleece",
  "Linen",
  "Synthetic",
  "Suede",
  "Other",
] as const;
const FITS = ["Slim", "Regular", "Relaxed", "Oversized", "Boxy", "Cropped"] as const;
const SEASONS = ["spring", "summer", "fall", "winter", "all"] as const;
const FORMALITY = ["loungewear", "casual", "smart_casual", "business", "formal"] as const;

const KIND_FOR: Record<
  (typeof CATEGORIES)[number],
  "clothing" | "shoes" | "accessory"
> = {
  top: "clothing",
  bottom: "clothing",
  outerwear: "clothing",
  shoes: "shoes",
  accessory: "accessory",
};

const schema = z.object({
  name: z.string().trim().min(1, "Name it").max(80, "Name too long"),
  category: z.enum(CATEGORIES),
  brand: z.string().trim().max(60).optional(),
  color: z.string().trim().max(30).optional(),
  secondary_colors: z.string().trim().max(120).optional(),
  material: z.string().trim().max(60).optional(),
  fit: z.string().trim().max(30).optional(),
  size: z.string().trim().max(20).optional(),
  price: z
    .number()
    .nonnegative("Price can't be negative")
    .max(100000, "Price too high")
    .optional(),
  notes: z.string().trim().max(500, "Keep notes under 500 characters").optional(),
  tags: z.string().trim().max(200).optional(),
  subcategory: z.string().trim().max(40).optional(),
});

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-input px-3 py-2.5 outline-none focus:border-primary text-sm";

function EditItem() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<ClosetItem | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "top" as (typeof CATEGORIES)[number],
    subcategory: "",
    brand: "",
    color: "",
    secondary_colors: "",
    material: "",
    fit: "",
    size: "",
    price: "",
    notes: "",
    tags: "",
  });
  const [season, setSeason] = useState<(typeof SEASONS)[number]>("all");
  const [formality, setFormality] = useState<(typeof FORMALITY)[number]>("casual");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("closet_items")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        setMsg({ kind: "err", text: "Item not found" });
        setLoading(false);
        return;
      }
      setItem(data);
      setForm({
        name: data.name,
        category: (data.category as (typeof CATEGORIES)[number]) ?? "top",
        subcategory: data.subcategory ?? "",
        brand: data.brand ?? "",
        color: data.color ?? "",
        secondary_colors: (data.secondary_colors ?? []).join(", "),
        material: data.material ?? "",
        fit: data.fit ?? "",
        size: data.size ?? "",
        price: data.price != null ? String(data.price) : "",
        notes: data.notes ?? "",
        tags: (data.tags ?? []).join(", "),
      });
      setSeason((data.season as (typeof SEASONS)[number]) ?? "all");
      setFormality((data.formality as (typeof FORMALITY)[number]) ?? "casual");
      if (data.image_url) setExistingUrl(await getSignedUrl(data.image_url));
      setLoading(false);
    })();
  }, [id]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setMsg({ kind: "err", text: "Image too large (max 8MB)" });
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRemovePhoto(false);
  }

  async function save() {
    if (!item) return;
    setMsg(null);
    const priceNum = form.price ? Number(form.price) : undefined;
    if (form.price && (Number.isNaN(priceNum!) || priceNum! < 0)) {
      setMsg({ kind: "err", text: "Price must be a positive number" });
      return;
    }
    const parsed = schema.safeParse({ ...form, price: priceNum });
    if (!parsed.success) {
      setMsg({ kind: "err", text: parsed.error.issues[0].message });
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      // Upload new photo first (never lose old on failure)
      let newImagePath: string | null | undefined = undefined; // undefined = keep existing
      if (file) {
        newImagePath = await uploadClosetImage(uid, file);
      } else if (removePhoto) {
        newImagePath = null;
      }

      const patch: Partial<ClosetItem> = {
        name: parsed.data.name,
        category: parsed.data.category,
        kind: KIND_FOR[parsed.data.category],
        subcategory: parsed.data.subcategory || null,
        brand: parsed.data.brand || null,
        color: parsed.data.color || null,
        secondary_colors: parsed.data.secondary_colors
          ? parsed.data.secondary_colors
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        material: parsed.data.material || null,
        fit: parsed.data.fit || null,
        size: parsed.data.size || null,
        price: parsed.data.price ?? null,
        notes: parsed.data.notes || null,
        tags: parsed.data.tags
          ? parsed.data.tags
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        season,
        formality,
      };
      if (newImagePath !== undefined) patch.image_url = newImagePath;

      const { error } = await supabase
        .from("closet_items")
        .update(patch)
        .eq("id", id)
        .eq("user_id", uid);
      if (error) {
        // Save failed: delete the just-uploaded orphan to keep storage clean.
        if (newImagePath && typeof newImagePath === "string") {
          void deleteClosetImage(newImagePath);
        }
        throw error;
      }

      // Only after successful save, delete the old image.
      if (item.image_url && newImagePath !== undefined) {
        if (newImagePath !== item.image_url) {
          void deleteClosetImage(item.image_url);
        }
      }

      setMsg({ kind: "ok", text: "Saved" });
      setTimeout(() => navigate({ to: "/closet/$id", params: { id } }), 400);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive() {
    if (!item) return;
    const { error } = await supabase
      .from("closet_items")
      .update({ archived: !item.archived })
      .eq("id", id);
    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }
    setItem({ ...item, archived: !item.archived });
    setMsg({
      kind: "ok",
      text: !item.archived ? "Archived — hidden from generator" : "Restored",
    });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!item) return <p className="text-sm text-destructive">Item not found</p>;

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Editing</p>
        <h1 className="mt-1 font-display text-3xl truncate">{item.name}</h1>
      </div>

      <div className="card-surface relative aspect-[3/2] overflow-hidden">
        {preview ? (
          <img src={preview} alt="new preview" className="h-full w-full object-cover" />
        ) : !removePhoto && existingUrl ? (
          <img src={existingUrl} alt="current" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-8 w-8" />
            <span className="text-xs uppercase tracking-widest">No photo</span>
          </div>
        )}
        <label className="absolute bottom-2 left-2 cursor-pointer rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] uppercase tracking-widest backdrop-blur">
          {preview || (!removePhoto && existingUrl) ? "Replace" : "Add photo"}
          <input type="file" accept="image/*" onChange={onFile} className="hidden" />
        </label>
        {(existingUrl || preview) && !removePhoto && (
          <button
            onClick={() => {
              setFile(null);
              setPreview(null);
              setRemovePhoto(true);
            }}
            className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-destructive/60 bg-background/80 px-3 py-1 text-[11px] uppercase tracking-widest text-destructive backdrop-blur"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      <Field label="Name*">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputCls}
          maxLength={80}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category*">
          <Select
            value={form.category}
            onChange={(v) =>
              setForm({ ...form, category: v as (typeof CATEGORIES)[number] })
            }
            options={[...CATEGORIES]}
          />
        </Field>
        <Field label="Subcategory">
          <input
            value={form.subcategory}
            onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
            className={inputCls}
            maxLength={40}
            placeholder="tee, joggers, bomber…"
          />
        </Field>
        <Field label="Brand">
          <input
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            className={inputCls}
            maxLength={60}
          />
        </Field>
        <Field label="Color">
          <input
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className={inputCls}
            maxLength={30}
          />
        </Field>
        <Field label="Secondary colors">
          <input
            value={form.secondary_colors}
            onChange={(e) => setForm({ ...form, secondary_colors: e.target.value })}
            className={inputCls}
            placeholder="cream, brown"
          />
        </Field>
        <Field label="Material">
          <Select
            value={form.material}
            onChange={(v) => setForm({ ...form, material: v })}
            options={["", ...MATERIALS]}
          />
        </Field>
        <Field label="Fit">
          <Select
            value={form.fit}
            onChange={(v) => setForm({ ...form, fit: v })}
            options={["", ...FITS]}
          />
        </Field>
        <Field label="Size">
          <input
            value={form.size}
            onChange={(e) => setForm({ ...form, size: e.target.value })}
            className={inputCls}
            maxLength={20}
          />
        </Field>
        <Field label="Price ($)">
          <input
            value={form.price}
            onChange={(e) =>
              setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, "") })
            }
            inputMode="decimal"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Season">
        <Select
          value={season}
          onChange={(v) => setSeason(v as (typeof SEASONS)[number])}
          options={[...SEASONS]}
        />
      </Field>

      <Field label="Formality">
        <Select
          value={formality}
          onChange={(v) => setFormality(v as (typeof FORMALITY)[number])}
          options={[...FORMALITY]}
        />
      </Field>

      <Field label="Tags (comma-separated)">
        <input
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          className={inputCls}
          placeholder="grail, gift, thrifted"
        />
      </Field>

      <Field label="Notes">
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className={inputCls}
          maxLength={500}
        />
      </Field>

      {msg && (
        <div
          role={msg.kind === "err" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-xs ${
            msg.kind === "err"
              ? "border-destructive/60 bg-destructive/10 text-destructive"
              : "border-primary/50 bg-primary/10 text-primary"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate({ to: "/closet/$id", params: { id } })}
          disabled={saving}
          className="rounded-full border border-border py-3 text-xs uppercase tracking-widest hover:bg-surface-2"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="btn-lime disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="card-surface p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Danger zone
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Archive hides this piece from outfit generation and shop analysis. You can
          restore it any time.
        </p>
        <button
          onClick={toggleArchive}
          className="mt-3 w-full rounded-full border border-border py-2.5 text-xs uppercase tracking-widest hover:bg-surface-2"
        >
          {item.archived ? "Unarchive" : "Archive"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o || "—"}
        </option>
      ))}
    </select>
  );
}
