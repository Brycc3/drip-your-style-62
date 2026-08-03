import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
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
    const { data: result, error } = await context.supabase.rpc("stage_catalog_import_batch", {
      _batch: {
        source_type: data.format === "csv" ? "manual_csv" : "manual_json",
        source_name: data.sourceName,
        source_url: data.sourceUrl || null,
        uploaded_file_name: data.fileName,
      },
      _rows: planned.map((row) => ({
        row_number: row.rowNumber,
        raw_data: row.raw,
        normalized_data: row.normalized,
        validation_errors: row.errors,
        warnings: row.warnings,
      })) as Json,
    });
    if (error || !result) throw new Error(error?.message ?? "Could not stage import batch");
    return result as {
      id: string;
      total: number;
      valid: number;
      invalid: number;
      duplicates: number;
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
      .select("id,row_number")
      .eq("id", data.id)
      .single();
    if (currentError || !current) throw new Error(currentError?.message ?? "Import row not found");

    const validated = validateCatalogImportRecord(data.normalized, current.row_number);
    const { data: result, error } = await context.supabase.rpc(
      "update_catalog_import_row_and_replan",
      {
        _row: data.id,
        _normalized: validated.normalized,
        _validation_errors: validated.errors,
        _warnings: validated.warnings,
      },
    );
    if (error || !result) throw new Error(error?.message ?? "Could not update import row");
    return result;
  });

export const resolveCatalogImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["create", "update", "skip"]),
        catalogTarget: z.string().uuid().nullable().optional(),
        confirmCreate: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("resolve_catalog_import_row", {
      _row: data.id,
      _action: data.action,
      _catalog_target: data.catalogTarget ?? null,
      _confirm_create: data.confirmCreate,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reviewCatalogImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("review_catalog_import_row", {
      _row: data.id,
      _decision: data.decision,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveValidCatalogImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => idSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const { data: approved, error } = await context.supabase.rpc(
      "approve_valid_catalog_import_rows",
      { _batch: data.id },
    );
    if (error) throw new Error(error.message);
    return { approved };
  });

export const deleteUncommittedCatalogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ path: z.string().max(500) }).parse(input))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const escapedUserId = context.userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const allowedPath = new RegExp(
      `^drafts/${escapedUserId}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(png|jpg|webp|avif)$`,
      "i",
    );
    if (!allowedPath.test(data.path)) throw new Error("Invalid catalog image draft path");
    const { error } = await context.supabase.storage.from("catalog-products").remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true };
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
      stagedImports: (batchesResult.data ?? []).filter(
        (batch) => !["imported", "rejected"].includes(batch.status),
      ).length,
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
