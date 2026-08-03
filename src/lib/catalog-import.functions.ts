import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireServerAdmin } from "./admin-auth";
import {
  CATALOG_IMPORT_FORMATS,
  parseCatalogImport,
  planCatalogImportRows,
  validateCatalogImportRecord,
  type ExistingCatalogIdentity,
} from "./catalog-import";
import { isValidHttpsUrl } from "./catalog-validation";
import { isVerifiedPurchasable, type VerifiableCatalogItem } from "./shop-catalog";

type ImportBatchInsert = Database["public"]["Tables"]["catalog_import_batches"]["Insert"];
type ImportRowInsert = Database["public"]["Tables"]["catalog_import_rows"]["Insert"];

const importUploadSchema = z.object({
  format: z.enum(CATALOG_IMPORT_FORMATS),
  sourceName: z.string().trim().min(1).max(120),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || isValidHttpsUrl(value), "Source URL must use HTTPS"),
  fileName: z.string().trim().min(1).max(180),
  content: z.string().min(2).max(1_000_000),
});

const idSchema = z.object({ id: z.string().uuid() });

export const createCatalogImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => importUploadSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const validated = parseCatalogImport(data.content, data.format);

    const { data: catalog, error: catalogError } = await context.supabase
      .from("shop_catalog")
      .select("id,external_id,retailer,buy_url,brand,name,color,is_demo")
      .limit(2000);
    if (catalogError) throw new Error(catalogError.message);

    const planned = planCatalogImportRows(validated, (catalog ?? []) as ExistingCatalogIdentity[]);
    const batchPayload: ImportBatchInsert = {
      created_by: context.userId,
      source_type: data.format === "csv" ? "manual_csv" : "manual_json",
      source_name: data.sourceName,
      source_url: data.sourceUrl || null,
      uploaded_file_name: data.fileName,
      status: "validating",
    };
    const { data: batch, error: batchError } = await context.supabase
      .from("catalog_import_batches")
      .insert(batchPayload)
      .select("id")
      .single();
    if (batchError || !batch)
      throw new Error(batchError?.message ?? "Could not create import batch");

    const rowPayloads: ImportRowInsert[] = planned.map((row) => ({
      batch_id: batch.id,
      row_number: row.rowNumber,
      raw_data: row.raw as Json,
      normalized_data: row.normalized as Json,
      validation_errors: row.errors,
      warnings: row.warnings,
      duplicate_reason: row.duplicateReason ?? null,
      proposed_action: row.action,
      review_status: "pending",
      catalog_id: row.catalogId ?? null,
    }));
    const { error: rowError } = await context.supabase
      .from("catalog_import_rows")
      .insert(rowPayloads);
    if (rowError) throw new Error(rowError.message);

    const { error: statusError } = await context.supabase
      .from("catalog_import_batches")
      .update({ status: "needs_review" })
      .eq("id", batch.id);
    if (statusError) throw new Error(statusError.message);

    return {
      id: batch.id,
      total: planned.length,
      valid: planned.filter((row) => row.errors.length === 0).length,
      invalid: planned.filter((row) => row.errors.length > 0).length,
      duplicates: planned.filter((row) => row.action !== "create").length,
    };
  });

export const listCatalogImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("catalog_import_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCatalogImportBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const [batchResult, rowsResult] = await Promise.all([
      context.supabase.from("catalog_import_batches").select("*").eq("id", data.id).single(),
      context.supabase
        .from("catalog_import_rows")
        .select("*")
        .eq("batch_id", data.id)
        .order("row_number"),
    ]);
    if (batchResult.error) throw new Error(batchResult.error.message);
    if (rowsResult.error) throw new Error(rowsResult.error.message);
    return { batch: batchResult.data, rows: rowsResult.data ?? [] };
  });

export const updateCatalogImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ id: z.string().uuid(), normalized: z.record(z.unknown()) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { data: current, error: currentError } = await context.supabase
      .from("catalog_import_rows")
      .select("id,row_number,catalog_id")
      .eq("id", data.id)
      .single();
    if (currentError || !current) throw new Error(currentError?.message ?? "Import row not found");

    const validated = validateCatalogImportRecord(data.normalized, current.row_number);
    const { data: catalog, error: catalogError } = await context.supabase
      .from("shop_catalog")
      .select("id,external_id,retailer,buy_url,brand,name,color,is_demo")
      .limit(2000);
    if (catalogError) throw new Error(catalogError.message);
    const [planned] = planCatalogImportRows(
      [validated],
      (catalog ?? []) as ExistingCatalogIdentity[],
    );

    const { error } = await context.supabase
      .from("catalog_import_rows")
      .update({
        normalized_data: planned.normalized as Json,
        validation_errors: planned.errors,
        warnings: planned.warnings,
        duplicate_reason: planned.duplicateReason ?? null,
        proposed_action: planned.action,
        catalog_id: planned.catalogId ?? current.catalog_id,
        review_status: "pending",
        reviewed_at: null,
        reviewed_by: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return {
      action: planned.action,
      catalogId: planned.catalogId,
      errors: planned.errors,
      warnings: planned.warnings,
      duplicateReason: planned.duplicateReason,
    };
  });

export const reviewCatalogImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { data: row, error: rowError } = await context.supabase
      .from("catalog_import_rows")
      .select("validation_errors,proposed_action")
      .eq("id", data.id)
      .single();
    if (rowError || !row) throw new Error(rowError?.message ?? "Import row not found");
    if (
      data.decision === "approved" &&
      (row.validation_errors.length > 0 || row.proposed_action === "manual_review")
    ) {
      throw new Error("Resolve validation and duplicate-review issues before approval");
    }
    const { error } = await context.supabase
      .from("catalog_import_rows")
      .update({
        review_status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveValidCatalogImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { data: rows, error: rowsError } = await context.supabase
      .from("catalog_import_rows")
      .select("id,validation_errors,proposed_action")
      .eq("batch_id", data.id);
    if (rowsError) throw new Error(rowsError.message);
    const approvable = (rows ?? []).filter(
      (row) => row.validation_errors.length === 0 && row.proposed_action !== "manual_review",
    );
    if (approvable.length === 0) throw new Error("This batch has no rows ready for approval");
    const { error } = await context.supabase
      .from("catalog_import_rows")
      .update({
        review_status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .in(
        "id",
        approvable.map((row) => row.id),
      );
    if (error) throw new Error(error.message);
    const { error: batchStatusError } = await context.supabase
      .from("catalog_import_batches")
      .update({ status: "approved" })
      .eq("id", data.id);
    if (batchStatusError) throw new Error(batchStatusError.message);
    return { approved: approvable.length };
  });

export const importApprovedCatalogRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { count, error: countError } = await context.supabase
      .from("catalog_import_rows")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", data.id)
      .eq("review_status", "approved");
    if (countError) throw new Error(countError.message);
    if (!count) throw new Error("Approve at least one valid row before importing");
    const { data: summary, error } = await context.supabase.rpc("import_catalog_batch", {
      _batch: data.id,
    });
    if (error) throw new Error(error.message);
    return summary;
  });

export const getCatalogImportDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const [batchesResult, rowsResult, catalogResult] = await Promise.all([
      context.supabase.from("catalog_import_batches").select("status"),
      context.supabase.from("catalog_import_rows").select("review_status"),
      context.supabase.from("shop_catalog").select("*").limit(2000),
    ]);
    if (batchesResult.error) throw new Error(batchesResult.error.message);
    if (rowsResult.error) throw new Error(rowsResult.error.message);
    if (catalogResult.error) throw new Error(catalogResult.error.message);
    const now = Date.now();
    const staleBoundary = 1000 * 60 * 60 * 24 * 30;
    const realCatalog = (catalogResult.data ?? []).filter((row) => !row.is_demo);
    const verifiedCatalog = realCatalog.filter((row) =>
      isVerifiedPurchasable(row as VerifiableCatalogItem),
    );
    return {
      stagedImports: (batchesResult.data ?? []).filter((batch) => batch.status !== "imported")
        .length,
      productsNeedingReview: (rowsResult.data ?? []).filter(
        (row) => row.review_status === "pending",
      ).length,
      productsNeedingVerification: realCatalog.filter(
        (row) =>
          !row.archived &&
          ["in_stock", "low_stock", "preorder"].includes(row.availability) &&
          !isVerifiedPurchasable(row as VerifiableCatalogItem),
      ).length,
      verifiedProducts: verifiedCatalog.length,
      staleProducts: realCatalog.filter((row) => {
        if (!row.verified_at || !row.last_checked_at) return false;
        return (
          now - Date.parse(row.verified_at) > staleBoundary ||
          now - Date.parse(row.last_checked_at) > staleBoundary
        );
      }).length,
      outOfStockProducts: realCatalog.filter((row) =>
        ["out_of_stock", "discontinued"].includes(row.availability),
      ).length,
      archivedProducts: realCatalog.filter((row) => row.archived).length,
    };
  });
