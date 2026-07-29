import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertCatalogRowWritable,
  buildVerifiedCatalogPayload,
  catalogAddSchema,
  catalogUpdateSchema,
} from "./catalog-validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireServerAdmin } from "./admin-auth";
import type { Database } from "@/integrations/supabase/types";

type CatalogInsert = Database["public"]["Tables"]["shop_catalog"]["Insert"];
type CatalogUpdate = Database["public"]["Tables"]["shop_catalog"]["Update"];

/**
 * Fetch the current row and hard-block writes against demo rows.
 * A missing row also throws so admins never silently write to nothing.
 */
async function loadNonDemoRow(supabase: SupabaseClient<Database>, id: string) {
  const { data, error } = await supabase
    .from("shop_catalog")
    .select("id,is_demo,source")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Product not found");
  const row = data as { id: string; is_demo: boolean | null; source: string | null };
  assertCatalogRowWritable(row);
  return row;
}

/**
 * ADD a verified catalog row. Non-demo, non-archived.
 */
export const addCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => catalogAddSchema.parse(i))
  .handler(async ({ context, data }) => {
    await requireServerAdmin(context.supabase, context.userId);
    const payload = buildVerifiedCatalogPayload(data) as CatalogInsert;
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
    const payload = buildVerifiedCatalogPayload(data.data);
    // Never allow archived/is_demo change via update — they have their own
    // dedicated paths (and is_demo is immutable).
    delete payload.archived;
    delete payload.is_demo;
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
 * Update the availability of a non-demo catalog row and refresh
 * last_checked_at.
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
      .update({
        availability: data.availability,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("is_demo", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
