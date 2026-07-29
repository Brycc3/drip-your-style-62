import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Save, Trash2, Plus, RefreshCw } from "lucide-react";
import { isVerifiedPurchasable, type VerifiableCatalogItem } from "@/lib/shop-catalog";
import type { CatalogItem } from "@/lib/shop-gap";

export const Route = createFileRoute("/_authenticated/admin/catalog")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Catalog admin — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!prof?.is_admin) throw redirect({ to: "/home" });
  },
  component: AdminCatalogPage,
});

type Row = CatalogItem & {
  source_type?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  image_rights_basis?: string | null;
  verified_at?: string | null;
  verification_method?: string | null;
  affiliate?: boolean | null;
  affiliate_disclosure?: string | null;
};

const FILTERS = ["all", "verified", "needs_verification", "demo"] as const;

function AdminCatalogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("needs_verification");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("shop_catalog")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Row[]);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "demo" && !r.is_demo) return false;
      if (filter === "verified" && !isVerifiedPurchasable(r as VerifiableCatalogItem)) return false;
      if (
        filter === "needs_verification" &&
        (r.is_demo || isVerifiedPurchasable(r as VerifiableCatalogItem))
      )
        return false;
      if (needle) {
        const hay = `${r.name} ${r.brand ?? ""} ${r.retailer ?? ""} ${r.category}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, filter, q]);

  async function remove(id: string) {
    if (!confirm("Delete this catalog row? This cannot be undone.")) return;
    const { error } = await supabase.from("shop_catalog").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
    toast.success("Deleted");
  }

  async function save(row: Row) {
    const payload = {
      name: row.name,
      brand: row.brand,
      retailer: row.retailer,
      buy_url: row.buy_url,
      image_url: row.image_url,
      current_price: row.current_price,
      original_price: row.original_price,
      availability: row.availability ?? "in_stock",
      source_type: row.source_type,
      source_name: row.source_name,
      source_url: row.source_url,
      image_rights_basis: row.image_rights_basis,
      verification_method: row.verification_method,
      verified_at: row.verified_at,
      last_checked_at: new Date().toISOString(),
      affiliate: row.affiliate ?? false,
      affiliate_disclosure: row.affiliate_disclosure,
      is_demo: row.is_demo,
    };
    const { data, error } = await supabase
      .from("shop_catalog")
      .update(payload)
      .eq("id", row.id)
      .select()
      .single();
    if (error) return toast.error(error.message);
    setRows((r) => r.map((x) => (x.id === row.id ? (data as Row) : x)));
    setEditing(null);
    toast.success("Saved");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
            <Shield className="h-3.5 w-3.5" /> Admin
          </p>
          <h1 className="mt-1 font-display text-4xl">Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify products so they can show a Shop now link. Demo rows stay as samples.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/moderation"
            className="rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2"
          >
            Moderation
          </Link>
          <button
            onClick={load}
            className="rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-surface-2 inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground/80"
            }`}
          >
            {f.replace("_", " ")}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, brand, retailer"
          className="ml-auto min-w-0 flex-1 rounded-full border border-border bg-input px-4 py-1.5 text-xs outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="card-surface p-5 text-center text-sm text-muted-foreground">
          No rows match this filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const verified = !r.is_demo && isVerifiedPurchasable(r as VerifiableCatalogItem);
            return (
              <li key={r.id} className="card-surface p-3">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">
                    {r.image_url && (
                      <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">
                      {[r.brand, r.retailer, r.category].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={r.is_demo ? "muted" : verified ? "good" : "warn"}>
                        {r.is_demo ? "Demo" : verified ? "Verified" : "Needs verification"}
                      </Badge>
                      {r.affiliate ? <Badge tone="muted">Affiliate</Badge> : null}
                      {r.availability ? <Badge tone="muted">{r.availability}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      onClick={() => setEditing(r)}
                      className="rounded-full border border-primary/60 px-3 py-1 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="rounded-full border border-destructive/60 px-3 py-1 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 justify-center"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        Need to add a product? Use{" "}
        <span className="text-foreground">Edit</span> on an existing demo row to convert it, or add
        via database (bulk import coming soon).{" "}
        <Plus className="inline h-3 w-3" />
      </p>

      {editing && (
        <EditModal row={editing} onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" | "muted" }) {
  const cls =
    tone === "good"
      ? "border-primary/60 text-primary"
      : tone === "warn"
        ? "border-destructive/60 text-destructive"
        : "border-border text-muted-foreground";
  return (
    <span className={`rounded-full border ${cls} px-2 py-0.5 text-[10px] uppercase tracking-widest`}>
      {children}
    </span>
  );
}

function EditModal({
  row,
  onClose,
  onSave,
}: {
  row: Row;
  onClose: () => void;
  onSave: (r: Row) => void;
}) {
  const [draft, setDraft] = useState<Row>(row);
  const set = <K extends keyof Row>(k: K, v: Row[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Edit product</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Text label="Name" value={draft.name} onChange={(v) => set("name", v)} full />
          <Text label="Brand" value={draft.brand ?? ""} onChange={(v) => set("brand", v)} />
          <Text label="Retailer" value={draft.retailer ?? ""} onChange={(v) => set("retailer", v)} />
          <Text label="Buy URL (https)" value={draft.buy_url ?? ""} onChange={(v) => set("buy_url", v)} full />
          <Text label="Image URL" value={draft.image_url ?? ""} onChange={(v) => set("image_url", v)} full />
          <Num label="Current price" value={draft.current_price} onChange={(v) => set("current_price", v)} />
          <Num label="Original price" value={draft.original_price ?? null} onChange={(v) => set("original_price", v)} />
          <Select
            label="Availability"
            value={draft.availability ?? "in_stock"}
            onChange={(v) => set("availability", v)}
            options={["in_stock", "low_stock", "preorder", "out_of_stock", "discontinued"]}
          />
          <Select
            label="Source type"
            value={draft.source_type ?? ""}
            onChange={(v) => set("source_type", v || null)}
            options={["", "manual", "affiliate_feed", "partner_api", "verified"]}
          />
          <Text label="Source name" value={draft.source_name ?? ""} onChange={(v) => set("source_name", v || null)} />
          <Text label="Source URL" value={draft.source_url ?? ""} onChange={(v) => set("source_url", v || null)} full />
          <Select
            label="Image rights"
            value={draft.image_rights_basis ?? ""}
            onChange={(v) => set("image_rights_basis", v || null)}
            options={["", "authorized", "project_owned", "licensed"]}
          />
          <Select
            label="Verification method"
            value={draft.verification_method ?? ""}
            onChange={(v) => set("verification_method", v || null)}
            options={["", "manual", "feed", "partner_api"]}
          />
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={draft.is_demo ?? false}
              onChange={(e) => set("is_demo", e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Demo product (never linked to a retailer)
          </label>
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={draft.affiliate ?? false}
              onChange={(e) => set("affiliate", e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Affiliate link (disclosure required)
          </label>
          {draft.affiliate && (
            <Text
              label="Affiliate disclosure"
              value={draft.affiliate_disclosure ?? ""}
              onChange={(v) => set("affiliate_disclosure", v || null)}
              full
            />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              set(
                "verified_at",
                (draft.verified_at ? null : new Date().toISOString()) as Row["verified_at"],
              )
            }
            className="rounded-full border border-primary/60 px-3 py-1.5 text-[11px] uppercase tracking-widest text-primary"
          >
            {draft.verified_at ? "Clear verified stamp" : "Stamp verified now"}
          </button>
          <span className="text-[11px] text-muted-foreground">
            {draft.verified_at ? `Verified: ${new Date(draft.verified_at).toLocaleString()}` : "Not verified"}
          </span>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="btn-lime flex-1 !py-2 text-xs inline-flex items-center justify-center gap-1"
          >
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Select({
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
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
