import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Save, Plus, RefreshCw, Archive, ArchiveRestore, BadgeCheck } from "lucide-react";
import { isVerifiedPurchasable, type VerifiableCatalogItem } from "@/lib/shop-catalog";
import {
  CATALOG_AVAILABILITY,
  CATALOG_ACCESSORY_SUBTYPES,
  CATALOG_CATEGORIES,
  CATALOG_CONDITIONS,
  CATALOG_FRAGRANCE_FAMILIES,
  CATALOG_IMAGE_RIGHTS,
  CATALOG_IMAGE_WARNING,
  CATALOG_PRICE_TIERS,
  CATALOG_SOURCE_TYPES,
  CATALOG_VERIFICATION_METHODS,
  catalogAddSchema,
  deriveCatalogKind,
  type CatalogAddInput,
} from "@/lib/catalog-validation";
import {
  addCatalogItem,
  setCatalogArchived,
  setCatalogAvailability,
  updateCatalogItem,
  verifyCatalogItem,
} from "@/lib/catalog-admin.functions";
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
  archived?: boolean | null;
};

// NB: is_demo is deliberately not editable anywhere in this UI.
const FILTERS = ["verified", "needs_verification", "archived", "demo"] as const;

function AdminCatalogPage() {
  const addFn = useServerFn(addCatalogItem);
  const updateFn = useServerFn(updateCatalogItem);
  const archiveFn = useServerFn(setCatalogArchived);
  const availabilityFn = useServerFn(setCatalogAvailability);
  const verifyFn = useServerFn(verifyCatalogItem);

  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("needs_verification");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("shop_catalog")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
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
      if (filter === "archived" && !(r.archived === true && !r.is_demo)) return false;
      if (filter === "verified") {
        if (r.is_demo) return false;
        if (r.archived === true) return false;
        if (!isVerifiedPurchasable(r as VerifiableCatalogItem)) return false;
      }
      if (filter === "needs_verification") {
        if (r.is_demo) return false;
        if (r.archived === true) return false;
        if (isVerifiedPurchasable(r as VerifiableCatalogItem)) return false;
      }
      if (needle) {
        const hay = `${r.name} ${r.brand ?? ""} ${r.retailer ?? ""} ${r.category}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, filter, q]);

  const demoIsReadOnly = filter === "demo";

  async function saveEdit(id: string, data: CatalogAddInput) {
    try {
      await updateFn({ data: { id, data } });
      toast.success("Saved");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function saveAdd(data: CatalogAddInput) {
    try {
      await addFn({ data });
      toast.success("Product added");
      setAdding(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    }
  }

  async function toggleArchive(row: Row) {
    if (row.is_demo) return; // guard even though the button is hidden
    const next = !(row.archived === true);
    try {
      await archiveFn({ data: { id: row.id, archived: next } });
      toast.success(next ? "Archived" : "Restored");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function updateAvailability(row: Row, availability: CatalogAddInput["availability"]) {
    if (row.is_demo) return;
    try {
      await availabilityFn({ data: { id: row.id, availability } });
      toast.success(`Availability set to ${availability.replaceAll("_", " ")}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function verify(row: Row) {
    if (row.is_demo) return;
    const verb = row.verified_at ? "Reverify" : "Verify";
    if (
      !window.confirm(
        `${verb} ${row.name}? This validates the current product, rights, provenance, price, and availability, then records the current server time.`,
      )
    )
      return;
    try {
      await verifyFn({ data: { id: row.id } });
      toast.success(`${verb} complete`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${verb} failed`);
    }
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
            Add and manage products, then explicitly verify complete rows. Demo rows are read-only
            and cannot be edited, archived, or converted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <button
            onClick={() => setAdding(true)}
            className="btn-lime inline-flex items-center gap-1 !px-3 !py-1.5 text-[11px]"
          >
            <Plus className="h-3 w-3" /> Add product
          </button>
        </div>
      </div>

      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[11px] text-destructive">
        {CATALOG_IMAGE_WARNING}
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

      {demoIsReadOnly && (
        <p className="card-surface p-3 text-[11px] text-muted-foreground">
          Demo products are protected. They exist to preview the gap engine using project-owned
          placeholder art and never link to a retailer. To ship a real product, use{" "}
          <span className="text-primary">Add product</span> above.
        </p>
      )}

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
            const archived = r.archived === true;
            return (
              <li key={r.id} className={`card-surface p-3 ${archived ? "opacity-70" : ""}`}>
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
                        {r.is_demo
                          ? "Demo (read-only)"
                          : verified
                            ? "Verified"
                            : "Needs verification"}
                      </Badge>
                      {archived && <Badge tone="warn">Archived</Badge>}
                      {r.affiliate ? <Badge tone="muted">Affiliate</Badge> : null}
                      {r.availability ? <Badge tone="muted">{r.availability}</Badge> : null}
                    </div>
                  </div>
                  {!r.is_demo && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        onClick={() => setEditing(r)}
                        className="rounded-full border border-primary/60 px-3 py-1 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10"
                      >
                        Edit
                      </button>
                      {!archived && (
                        <button
                          onClick={() => void verify(r)}
                          className="rounded-full border border-primary/60 px-3 py-1 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10 inline-flex items-center gap-1 justify-center"
                        >
                          <BadgeCheck className="h-3 w-3" />
                          {r.verified_at ? "Reverify" : "Verify"}
                        </button>
                      )}
                      <button
                        onClick={() => toggleArchive(r)}
                        className="rounded-full border border-border px-3 py-1 text-[10px] uppercase tracking-widest hover:bg-surface-2 inline-flex items-center gap-1 justify-center"
                      >
                        {archived ? (
                          <>
                            <ArchiveRestore className="h-3 w-3" /> Restore
                          </>
                        ) : (
                          <>
                            <Archive className="h-3 w-3" /> Archive
                          </>
                        )}
                      </button>
                      <label className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        Stock status
                        <select
                          aria-label={`Availability for ${r.name}`}
                          value={r.availability ?? "out_of_stock"}
                          onChange={(event) =>
                            void updateAvailability(
                              r,
                              event.target.value as CatalogAddInput["availability"],
                            )
                          }
                          className="mt-1 block max-w-36 rounded-full border border-border bg-background px-2 py-1 text-[10px] normal-case tracking-normal text-foreground"
                        >
                          {CATALOG_AVAILABILITY.map((status) => (
                            <option key={status} value={status}>
                              {status.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding && <EditorModal onClose={() => setAdding(false)} onSave={saveAdd} />}
      {editing && (
        <EditorModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => saveEdit(editing.id, data)}
        />
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
    <span
      className={`rounded-full border ${cls} px-2 py-0.5 text-[10px] uppercase tracking-widest`}
    >
      {children}
    </span>
  );
}

/**
 * Editor for both add and edit flows. Uses the SAME Zod schema as the server
 * so a client-side error surfaces immediately and a server-side error can
 * only fire on things the client cannot check (admin gate, demo row, DB).
 */
function EditorModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Row;
  onClose: () => void;
  onSave: (data: CatalogAddInput) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Partial<CatalogAddInput>>(() => ({
    name: initial?.name ?? "",
    brand: initial?.brand ?? "",
    category: (initial?.category as CatalogAddInput["category"]) ?? "top",
    kind: (initial?.kind as CatalogAddInput["kind"]) ?? "clothing",
    color: initial?.color ?? "",
    material: initial?.material ?? "",
    fit: initial?.fit ?? "",
    formality: (initial?.formality as CatalogAddInput["formality"]) ?? "casual",
    season: (initial?.season as CatalogAddInput["season"]) ?? "all",
    condition: (initial?.condition as CatalogAddInput["condition"]) ?? "new",
    retailer: initial?.retailer ?? "",
    buy_url: initial?.buy_url ?? "",
    image_url: initial?.image_url ?? "",
    current_price: initial?.current_price ?? undefined,
    original_price: initial?.original_price ?? undefined,
    availability: (initial?.availability as CatalogAddInput["availability"]) ?? "in_stock",
    source_type: (initial?.source_type as CatalogAddInput["source_type"]) ?? "manual",
    source_name: initial?.source_name ?? "",
    source_url: initial?.source_url ?? "",
    image_rights_basis:
      (initial?.image_rights_basis as CatalogAddInput["image_rights_basis"]) ?? "authorized",
    verification_method:
      (initial?.verification_method as CatalogAddInput["verification_method"]) ?? "manual",
    vibe: initial?.vibe ?? "",
    price_tier: (initial?.price_tier as CatalogAddInput["price_tier"]) ?? "mid",
    accessory_subtype: (initial?.accessory_subtype as CatalogAddInput["accessory_subtype"]) ?? "",
    fragrance_family: (initial?.fragrance_family as CatalogAddInput["fragrance_family"]) ?? "",
    affiliate: initial?.affiliate ?? false,
    affiliate_disclosure: initial?.affiliate_disclosure ?? "",
    description: initial?.description ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ack, setAck] = useState(false);

  function set<K extends keyof CatalogAddInput>(k: K, v: CatalogAddInput[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function setCategory(value: CatalogAddInput["category"]) {
    const kind = deriveCatalogKind(value);
    setDraft((draftValue) => ({
      ...draftValue,
      category: value,
      kind,
      accessory_subtype: kind === "accessory" ? draftValue.accessory_subtype : "",
      fragrance_family: kind === "fragrance" ? draftValue.fragrance_family : "",
    }));
  }

  function attempt() {
    if (!ack) {
      setErrors({ _ack: "You must acknowledge the image-rights warning" });
      return;
    }
    const parsed = catalogAddSchema.safeParse(draft);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[issue.path.join(".") || "_"] = issue.message;
      setErrors(map);
      return;
    }
    setErrors({});
    void onSave(parsed.data);
  }

  const isEdit = Boolean(initial);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.3em] text-primary">
          {isEdit ? "Edit product" : "Add product"}
        </p>
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[11px] text-destructive">
          {CATALOG_IMAGE_WARNING}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Text
            label="Name*"
            value={draft.name ?? ""}
            onChange={(v) => set("name", v)}
            full
            error={errors.name}
          />
          <Text
            label="Brand*"
            value={draft.brand ?? ""}
            onChange={(v) => set("brand", v)}
            error={errors.brand}
          />
          <Select
            label="Category*"
            value={draft.category ?? "top"}
            onChange={(v) => setCategory(v as CatalogAddInput["category"])}
            options={[...CATALOG_CATEGORIES]}
            error={errors.category}
          />
          <ReadOnly label="Kind (derived)" value={draft.kind ?? "clothing"} error={errors.kind} />
          <Text
            label="Color*"
            value={draft.color ?? ""}
            onChange={(v) => set("color", v)}
            error={errors.color}
          />
          <Text
            label="Material"
            value={draft.material ?? ""}
            onChange={(v) => set("material", v)}
          />
          <Text label="Fit" value={draft.fit ?? ""} onChange={(v) => set("fit", v)} />
          <Select
            label="Formality"
            value={draft.formality ?? "casual"}
            onChange={(v) => set("formality", v as CatalogAddInput["formality"])}
            options={["loungewear", "casual", "smart_casual", "business", "formal"]}
          />
          <Select
            label="Season"
            value={draft.season ?? "all"}
            onChange={(v) => set("season", v as CatalogAddInput["season"])}
            options={["all", "spring", "summer", "fall", "winter"]}
          />
          <Select
            label="Condition"
            value={draft.condition ?? "new"}
            onChange={(v) => set("condition", v as CatalogAddInput["condition"])}
            options={[...CATALOG_CONDITIONS]}
          />
          <Text
            label="Retailer*"
            value={draft.retailer ?? ""}
            onChange={(v) => set("retailer", v)}
            error={errors.retailer}
          />
          <Text
            label="Product URL (https://…)*"
            value={draft.buy_url ?? ""}
            onChange={(v) => set("buy_url", v)}
            full
            error={errors.buy_url}
          />
          <Text
            label="Image URL or /catalog/… path*"
            value={draft.image_url ?? ""}
            onChange={(v) => set("image_url", v)}
            full
            error={errors.image_url}
          />
          <Num
            label="Current price*"
            value={draft.current_price ?? null}
            onChange={(v) => set("current_price", v as CatalogAddInput["current_price"])}
            error={errors.current_price}
          />
          <Num
            label="Original price"
            value={draft.original_price ?? null}
            onChange={(v) => set("original_price", v as CatalogAddInput["original_price"])}
            error={errors.original_price}
          />
          <Select
            label="Availability*"
            value={draft.availability ?? "in_stock"}
            onChange={(v) => set("availability", v as CatalogAddInput["availability"])}
            options={[...CATALOG_AVAILABILITY]}
            error={errors.availability}
          />
          <Select
            label="Source type*"
            value={draft.source_type ?? "manual"}
            onChange={(v) => set("source_type", v as CatalogAddInput["source_type"])}
            options={[...CATALOG_SOURCE_TYPES]}
            error={errors.source_type}
          />
          <Text
            label="Source name*"
            value={draft.source_name ?? ""}
            onChange={(v) => set("source_name", v)}
            error={errors.source_name}
          />
          <Text
            label="Source URL"
            value={draft.source_url ?? ""}
            onChange={(v) => set("source_url", v)}
            full
            error={errors.source_url}
          />
          <Select
            label="Image rights basis*"
            value={draft.image_rights_basis ?? "authorized"}
            onChange={(v) => set("image_rights_basis", v as CatalogAddInput["image_rights_basis"])}
            options={[...CATALOG_IMAGE_RIGHTS]}
            error={errors.image_rights_basis}
          />
          <Select
            label="Verification method*"
            value={draft.verification_method ?? "manual"}
            onChange={(v) =>
              set("verification_method", v as CatalogAddInput["verification_method"])
            }
            options={[...CATALOG_VERIFICATION_METHODS]}
            error={errors.verification_method}
          />
          <Text
            label="Vibe*"
            value={draft.vibe ?? ""}
            onChange={(v) => set("vibe", v)}
            error={errors.vibe}
          />
          <Select
            label="Price tier*"
            value={draft.price_tier ?? "mid"}
            onChange={(v) => set("price_tier", v as CatalogAddInput["price_tier"])}
            options={[...CATALOG_PRICE_TIERS]}
            error={errors.price_tier}
          />
          {draft.kind === "accessory" && (
            <Select
              label="Accessory subtype*"
              value={draft.accessory_subtype ?? ""}
              onChange={(v) => set("accessory_subtype", v as CatalogAddInput["accessory_subtype"])}
              options={["", ...CATALOG_ACCESSORY_SUBTYPES]}
              error={errors.accessory_subtype}
            />
          )}
          {draft.kind === "fragrance" && (
            <Select
              label="Fragrance family*"
              value={draft.fragrance_family ?? ""}
              onChange={(v) => set("fragrance_family", v as CatalogAddInput["fragrance_family"])}
              options={["", ...CATALOG_FRAGRANCE_FAMILIES]}
              error={errors.fragrance_family}
            />
          )}
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
              label="Affiliate disclosure*"
              value={draft.affiliate_disclosure ?? ""}
              onChange={(v) => set("affiliate_disclosure", v)}
              full
              error={errors.affiliate_disclosure}
            />
          )}
          <Text
            label="Description"
            value={draft.description ?? ""}
            onChange={(v) => set("description", v)}
            full
          />
        </div>

        <label className="mt-4 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="text-muted-foreground">
            I am authorized to display this product's image and information.
          </span>
        </label>
        {errors._ack && <p className="mt-1 text-[11px] text-destructive">{errors._ack}</p>}
        {errors._ && <p className="mt-1 text-[11px] text-destructive">{errors._}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border py-2 text-xs uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={attempt}
            className="btn-lime flex-1 !py-2 text-xs inline-flex items-center justify-center gap-1"
          >
            <Save className="h-3 w-3" /> {isEdit ? "Save without reverifying" : "Add product"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadOnly({ label, value, error }: { label: string; value: string; error?: string }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div
        className={`mt-1 w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm ${
          error ? "border-destructive/60" : "border-border"
        }`}
      >
        {value}
      </div>
      {error && <span className="mt-1 block text-[10px] text-destructive">{error}</span>}
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  full,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
  error?: string;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border bg-input px-3 py-2 text-sm outline-none focus:border-primary ${
          error ? "border-destructive/60" : "border-border"
        }`}
      />
      {error && <span className="mt-1 block text-[10px] text-destructive">{error}</span>}
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | undefined) => void;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className={`mt-1 w-full rounded-lg border bg-input px-3 py-2 text-sm outline-none focus:border-primary ${
          error ? "border-destructive/60" : "border-border"
        }`}
      />
      {error && <span className="mt-1 block text-[10px] text-destructive">{error}</span>}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border bg-input px-3 py-2 text-sm outline-none focus:border-primary ${
          error ? "border-destructive/60" : "border-border"
        }`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-[10px] text-destructive">{error}</span>}
    </label>
  );
}
