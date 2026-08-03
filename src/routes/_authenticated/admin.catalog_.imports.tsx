import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileJson, FileSpreadsheet, ImageUp, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database as AppDatabase } from "@/integrations/supabase/types";
import {
  approveValidCatalogImportRows,
  createCatalogImportBatch,
  getCatalogImportBatch,
  getCatalogImportDashboard,
  importApprovedCatalogRows,
  listCatalogImportBatches,
  reviewCatalogImportRow,
  updateCatalogImportRow,
} from "@/lib/catalog-import.functions";
import { parseCatalogImport } from "@/lib/catalog-import";
import { CATALOG_IMAGE_WARNING } from "@/lib/catalog-validation";

export const Route = createFileRoute("/_authenticated/admin/catalog_/imports")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Real-product imports — DRIP" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.is_admin) throw redirect({ to: "/home" });
  },
  component: CatalogImportsPage,
});

type ImportBatch = AppDatabase["public"]["Tables"]["catalog_import_batches"]["Row"];
type ImportRow = AppDatabase["public"]["Tables"]["catalog_import_rows"]["Row"];
type BatchDetail = { batch: ImportBatch; rows: ImportRow[] };
type Dashboard = {
  stagedImports: number;
  productsNeedingReview: number;
  productsNeedingVerification: number;
  verifiedProducts: number;
  staleProducts: number;
  outOfStockProducts: number;
  archivedProducts: number;
};
type RowFilter = "all" | "valid" | "invalid" | "duplicate" | "warning";

function CatalogImportsPage() {
  const listFn = useServerFn(listCatalogImportBatches);
  const detailFn = useServerFn(getCatalogImportBatch);
  const dashboardFn = useServerFn(getCatalogImportDashboard);
  const createFn = useServerFn(createCatalogImportBatch);
  const approveAllFn = useServerFn(approveValidCatalogImportRows);
  const importFn = useServerFn(importApprovedCatalogRows);

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rightsAccepted, setRightsAccepted] = useState(false);

  async function load(selectedId?: string) {
    setLoading(true);
    try {
      const [nextBatches, nextDashboard] = await Promise.all([listFn(), dashboardFn()]);
      setBatches(nextBatches as ImportBatch[]);
      setDashboard(nextDashboard);
      const target = selectedId ?? detail?.batch.id ?? nextBatches[0]?.id;
      if (target) setDetail((await detailFn({ data: { id: target } })) as BatchDetail);
      else setDetail(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load catalog imports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial hydration only; subsequent refreshes are explicit and preserve the selected batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadBatch() {
    if (!file) return toast.error("Choose a CSV or JSON file");
    if (!sourceName.trim()) return toast.error("Enter the authorized source name");
    if (!rightsAccepted) return toast.error("Acknowledge the rights and provenance policy first");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv" && extension !== "json") {
      return toast.error("Only .csv and .json files are supported");
    }
    setBusy(true);
    try {
      const content = await file.text();
      // Run the shared schema in the browser for immediate file/shape feedback.
      // The server repeats the complete validation before anything is staged.
      parseCatalogImport(content, extension);
      const result = await createFn({
        data: {
          format: extension,
          sourceName,
          sourceUrl,
          fileName: file.name,
          content,
        },
      });
      toast.success(
        `Staged ${result.total} rows: ${result.valid} valid, ${result.invalid} invalid, ${result.duplicates} duplicate candidates.`,
      );
      setFile(null);
      await load(result.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function approveAll() {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await approveAllFn({ data: { id: detail.batch.id } });
      toast.success(`Approved ${result.approved} valid rows. Verification is still separate.`);
      await load(detail.batch.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  async function importApproved() {
    if (!detail) return;
    if (!window.confirm("Import approved rows as unverified products? This does not Verify them."))
      return;
    setBusy(true);
    try {
      const summary = (await importFn({ data: { id: detail.batch.id } })) as Record<
        string,
        unknown
      >;
      toast.success(
        `Import complete: ${summary.created ?? 0} created, ${summary.updated ?? 0} updated, ${summary.skipped ?? 0} skipped.`,
      );
      await load(detail.batch.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const visibleRows = useMemo(() => {
    const rows = detail?.rows ?? [];
    if (filter === "valid") return rows.filter((row) => row.validation_errors.length === 0);
    if (filter === "invalid") return rows.filter((row) => row.validation_errors.length > 0);
    if (filter === "duplicate") return rows.filter((row) => row.proposed_action !== "create");
    if (filter === "warning") return rows.filter((row) => row.warnings.length > 0);
    return rows;
  }, [detail, filter]);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-primary">Admin · Catalog</p>
          <h1 className="mt-1 font-display text-4xl">Real-product imports</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Stage authorized CSV or JSON data, correct normalized fields, review duplicates, and
            import approved rows. Imported products always begin unverified and cannot appear as
            purchasable until the separate Verify action passes.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/catalog" className="rounded-full border border-border px-4 py-2 text-xs">
            Verification queue
          </Link>
          <button
            onClick={() => load()}
            className="rounded-full border border-border p-2"
            aria-label="Refresh imports"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <DashboardCards dashboard={dashboard} />

      <section className="card-surface p-5">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <h2 className="font-display text-xl">Stage an authorized file</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">
            Source name
            <input
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              placeholder="Authorized partner or manual source"
              className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm normal-case tracking-normal text-foreground"
            />
          </label>
          <label className="text-xs uppercase tracking-widest text-muted-foreground">
            Source URL (optional HTTPS)
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://partner.example/feed"
              className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm normal-case tracking-normal text-foreground"
            />
          </label>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm">
          {file?.name.endsWith(".json") ? (
            <FileJson className="h-5 w-5 text-primary" />
          ) : (
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          )}
          <span>{file?.name ?? "Choose an import-template.csv or import-template.json file"}</span>
          <input
            type="file"
            accept=".csv,.json,application/json,text/csv"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-amber-200">Rights and provenance review</p>
          <p className="mt-1">{CATALOG_IMAGE_WARNING}</p>
          <label className="mt-3 flex items-start gap-2 text-foreground/80">
            <input
              type="checkbox"
              checked={rightsAccepted}
              onChange={(event) => setRightsAccepted(event.target.checked)}
              className="mt-0.5"
            />
            I confirm this source is authorized and the submitted price, availability, affiliate,
            provenance, and image-rights claims are not fabricated.
          </label>
        </div>
        <button onClick={uploadBatch} disabled={busy} className="btn-lime mt-4 disabled:opacity-50">
          Preview before import
        </button>
      </section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="card-surface min-w-0 h-fit p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
            Import batches
          </h2>
          <div className="mt-3 space-y-2">
            {batches.map((batch) => (
              <button
                key={batch.id}
                onClick={() => load(batch.id)}
                className={`w-full rounded-lg border p-3 text-left ${
                  detail?.batch.id === batch.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <p className="truncate text-sm font-medium">{batch.uploaded_file_name}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {batch.status.replaceAll("_", " ")} · {batch.total_row_count} rows
                </p>
              </button>
            ))}
            {!loading && batches.length === 0 && (
              <p className="text-sm text-muted-foreground">No staged imports yet.</p>
            )}
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          {detail ? (
            <>
              <BatchHeader
                detail={detail}
                filter={filter}
                setFilter={setFilter}
                approveAll={approveAll}
                importApproved={importApproved}
                busy={busy}
              />
              <div className="space-y-3">
                {visibleRows.map((row) => (
                  <ImportRowCard key={row.id} row={row} onChanged={() => load(detail.batch.id)} />
                ))}
                {visibleRows.length === 0 && (
                  <div className="card-surface p-6 text-center text-sm text-muted-foreground">
                    No rows match this review filter.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card-surface p-8 text-center text-sm text-muted-foreground">
              Upload a CSV or JSON file to begin a review.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DashboardCards({ dashboard }: { dashboard: Dashboard | null }) {
  const cards = [
    ["Staged imports", dashboard?.stagedImports ?? 0],
    ["Needs review", dashboard?.productsNeedingReview ?? 0],
    ["Needs verification", dashboard?.productsNeedingVerification ?? 0],
    ["Verified", dashboard?.verifiedProducts ?? 0],
    ["Stale", dashboard?.staleProducts ?? 0],
    ["Out of stock", dashboard?.outOfStockProducts ?? 0],
    ["Archived", dashboard?.archivedProducts ?? 0],
  ] as const;
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {cards.map(([label, value]) => (
        <div key={label} className="card-surface p-3">
          <p className="font-display text-2xl text-primary">{value}</p>
          <p className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
        </div>
      ))}
    </section>
  );
}

function BatchHeader({
  detail,
  filter,
  setFilter,
  approveAll,
  importApproved,
  busy,
}: {
  detail: BatchDetail;
  filter: RowFilter;
  setFilter: (filter: RowFilter) => void;
  approveAll: () => void;
  importApproved: () => void;
  busy: boolean;
}) {
  const filters: RowFilter[] = ["all", "valid", "invalid", "duplicate", "warning"];
  return (
    <div className="card-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-primary">
            {detail.batch.status.replaceAll("_", " ")}
          </p>
          <h2 className="font-display text-2xl">{detail.batch.uploaded_file_name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {detail.batch.source_name} · {detail.batch.valid_row_count} valid ·{" "}
            {detail.batch.invalid_row_count} invalid · {detail.batch.duplicate_row_count} duplicate
            candidates
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={approveAll}
            disabled={busy || detail.batch.status === "imported"}
            className="rounded-full border border-primary px-3 py-1.5 text-xs text-primary disabled:opacity-40"
          >
            Approve all valid
          </button>
          <button
            onClick={importApproved}
            disabled={busy || detail.batch.status === "imported"}
            className="btn-lime !px-4 !py-1.5 text-xs disabled:opacity-40"
          >
            Import approved
          </button>
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {filters.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest ${
              filter === item
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImportRowCard({ row, onChanged }: { row: ImportRow; onChanged: () => Promise<void> }) {
  const reviewFn = useServerFn(reviewCatalogImportRow);
  const updateFn = useServerFn(updateCatalogImportRow);
  const normalized = row.normalized_data as Record<string, unknown>;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(JSON.stringify(normalized, null, 2));
  const [busy, setBusy] = useState(false);
  const [imageRightsAccepted, setImageRightsAccepted] = useState(false);

  async function review(decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await reviewFn({ data: { id: row.id, decision } });
      toast.success(decision === "approved" ? "Row approved" : "Row rejected");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrection() {
    setBusy(true);
    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>;
      await updateFn({ data: { id: row.id, normalized: parsed } });
      toast.success("Normalized data revalidated; original input was preserved");
      setEditing(false);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Correction failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAuthorizedImage(file: File) {
    if (!imageRightsAccepted) return toast.error("Confirm image display rights before uploading");
    const extension = file.name.split(".").pop()?.toLowerCase();
    const normalizedExtension = extension === "jpeg" ? "jpg" : extension;
    if (!normalizedExtension || !["png", "jpg", "webp", "avif"].includes(normalizedExtension)) {
      return toast.error("Use PNG, JPG, WebP, or AVIF");
    }
    setBusy(true);
    try {
      const path = `authorized/${crypto.randomUUID()}/${crypto.randomUUID()}.${normalizedExtension}`;
      const { error } = await supabase.storage.from("catalog-products").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("catalog-products").getPublicUrl(path);
      const next = { ...JSON.parse(draft), image_url: data.publicUrl };
      setDraft(JSON.stringify(next, null, 2));
      toast.success("Authorized image uploaded. Save correction to stage its URL.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setBusy(false);
    }
  }

  const actionColor =
    row.proposed_action === "create"
      ? "text-emerald-300"
      : row.proposed_action === "update"
        ? "text-sky-300"
        : row.proposed_action === "skip"
          ? "text-muted-foreground"
          : "text-amber-300";

  return (
    <article className="card-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-widest">
            <span className={actionColor}>{row.proposed_action.replaceAll("_", " ")}</span>
            <span className="text-muted-foreground">Row {row.row_number}</span>
            <span className="text-muted-foreground">{row.review_status}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-medium">
            {[normalized.brand, normalized.name].filter(Boolean).join(" · ") ||
              "Unresolved product"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {[normalized.retailer, normalized.category, normalized.color]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing((value) => !value)}
            className="rounded-full border border-border px-3 py-1 text-[10px]"
          >
            Correct staged data
          </button>
          <button
            onClick={() => review("rejected")}
            disabled={busy}
            className="rounded-full border border-border px-3 py-1 text-[10px] disabled:opacity-40"
          >
            Reject
          </button>
          <button
            onClick={() => review("approved")}
            disabled={
              busy || row.validation_errors.length > 0 || row.proposed_action === "manual_review"
            }
            className="rounded-full border border-primary px-3 py-1 text-[10px] text-primary disabled:opacity-30"
          >
            Approve
          </button>
        </div>
      </div>

      {row.duplicate_reason && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-2 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {row.duplicate_reason}
        </p>
      )}
      {row.validation_errors.length > 0 && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-[9px] uppercase tracking-widest text-destructive">Validation errors</p>
          <ul className="mt-2 space-y-1">
            {row.validation_errors.map((error) => (
              <li key={error} className="text-xs text-destructive">
                · {error}
              </li>
            ))}
          </ul>
        </div>
      )}
      {row.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {row.warnings.map((warning) => (
            <li key={warning}>· {warning}</li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Edit normalized data only. The original raw row remains immutable for auditability.
          </p>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={15}
            spellCheck={false}
            className="w-full rounded-lg border border-border bg-input p-3 font-mono text-xs text-foreground"
          />
          <div className="rounded-md border border-border p-3">
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={imageRightsAccepted}
                onChange={(event) => setImageRightsAccepted(event.target.checked)}
                className="mt-0.5"
              />
              I am authorized to display this uploaded image and recorded the correct rights basis
              and source reference in the normalized data.
            </label>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs">
              <ImageUp className="h-3.5 w-3.5" /> Upload authorized image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                className="sr-only"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) uploadAuthorizedImage(selected);
                }}
              />
            </label>
          </div>
          <button onClick={saveCorrection} disabled={busy} className="btn-lime disabled:opacity-50">
            Save correction and revalidate
          </button>
        </div>
      )}
    </article>
  );
}
