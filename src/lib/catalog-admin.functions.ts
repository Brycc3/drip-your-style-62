import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertCatalogRowWritable,
  buildCatalogPayload,
  buildNewCatalogPayload,
  catalogAddSchema,
  catalogUpdateSchema,
} from "./catalog-validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireServerAdmin } from "./admin-auth";
import type { Database } from "@/integrations/supabase/types";

type CatalogInsert = Database["public"]["Tables"]["shop_catalog"]["Insert"];
type CatalogRow = Database["public"]["Tables"]["shop_catalog"]["Row"];
type CatalogUpdate = Database["public"]["Tables"]["shop_catalog"]["Update"];

/**
 * Fetch the current row and hard-block writes against demo rows.
 * A missing row also throws so admins never silently write to nothing.
 */
async function loadNonDemoRow(supabase: SupabaseClient<Database>, id: string) {
  const { data, error } = await supabase
    .from("shop_catalog")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Product not found");
  const row = data as CatalogRow;
  assertCatalogRowWritable(row);
  return row;
}

function validateStoredCatalogRow(row: CatalogRow) {
  return catalogAddSchema.parse({
    name: row.name,
    brand: row.brand ?? "",
    category: row.category,
    kind: row.kind,
    color: row.color ?? "",
    material: row.material ?? "",
    fit: row.fit ?? "",
    formality: row.formality,
    season: row.season,
    condition: row.condition,
    retailer: row.retailer ?? "",
    buy_url: row.buy_url ?? "",
    image_url: row.image_url ?? "",
    current_price: row.current_price,
    original_price: row.original_price ?? undefined,
    availability: row.availability,
    source_type: row.source_type,
    source_name: row.source_name ?? "",
    source_url: row.source_url ?? undefined,
    image_rights_basis: row.image_rights_basis,
    verification_method: row.verification_method,
    vibe: row.vibe ?? "",
    price_tier: row.price_tier,
    accessory_subtype: row.accessory_subtype ?? "",
    fragrance_family: row.fragrance_family ?? "",
    affiliate: row.affiliate,
    affiliate_disclosure: row.affiliate_disclosure ?? "",
    description: row.description ?? "",
  });
}

/**
 * Add an unverified catalog row. Verification is a separate explicit action.
 */
export const addCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => catalogAddSchema.parse(i))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const payload = buildNewCatalogPayload(data) as CatalogInsert;
    const { data: inserted, error } = await context.supabase
      .from("shop_catalog")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string } | null)?.id ?? "" };
  });

/**
 * UPDATE a non-demo catalog row. Rejects any attempt to write to a demo row
 * on the server, regardless of the client payload.
 */
export const updateCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: z.string().uuid(), data: catalogUpdateSchema }).parse(i))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    await loadNonDemoRow(context.supabase, data.id);
    // Routine edits intentionally omit verified_at and last_checked_at.
    const payload = buildCatalogPayload(data.data);
    const { error } = await context.supabase
      .from("shop_catalog")
      .update(payload as CatalogUpdate)
      .eq("id", data.id)
      .eq("is_demo", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Archive / unarchive a non-demo catalog row. Archived rows disappear from
 * Shop but are preserved in the DB.
 */
export const setCatalogArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    await loadNonDemoRow(context.supabase, data.id);
    const { error } = await context.supabase
      .from("shop_catalog")
      .update({ archived: data.archived })
      .eq("id", data.id)
      .eq("is_demo", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Update availability without changing verification timestamps.
 */
export const setCatalogAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z
      .object({
        id: z.string().uuid(),
        availability: z.enum(["in_stock", "low_stock", "preorder", "out_of_stock", "discontinued"]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    await loadNonDemoRow(context.supabase, data.id);
    const { error } = await context.supabase
      .from("shop_catalog")
      .update({ availability: data.availability })
      .eq("id", data.id)
      .eq("is_demo", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Explicitly verify/reverify the complete stored row. Shared server validation
 * runs first; the database RPC independently authorizes the admin, validates
 * the row, and is the only path permitted to refresh both timestamps.
 */
export const verifyCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const row = await loadNonDemoRow(context.supabase, data.id);
    if (row.archived) throw new Error("Restore this product before verifying it");
    validateStoredCatalogRow(row);
    const { data: verifiedAt, error } = await context.supabase.rpc("verify_shop_catalog_item", {
      _catalog_id: data.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true, verified_at: verifiedAt };
  });
