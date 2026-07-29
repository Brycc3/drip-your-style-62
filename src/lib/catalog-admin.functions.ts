import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { catalogAddSchema, catalogUpdateSchema } from "./catalog-validation";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side admin gate. RLS on shop_catalog would also block writes for
 * non-admins if policies were tight, but we do NOT depend on that — every
 * write path here explicitly re-checks the profiles.is_admin flag before
 * touching the row.
 */
async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!(data as { is_admin?: boolean } | null)?.is_admin) throw new Error("Forbidden");
}

/**
 * Fetch the current row and hard-block writes against demo rows.
 * A missing row also throws so admins never silently write to nothing.
 */
async function loadNonDemoRow(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("shop_catalog")
    .select("id,is_demo")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Product not found");
  if ((data as { is_demo?: boolean }).is_demo === true) {
    throw new Error("Demo products are read-only. Add a new verified product instead.");
  }
  return data as { id: string; is_demo: boolean | null };
}

function buildDbPayload(input: z.infer<typeof catalogAddSchema>) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    name: input.name,
    brand: input.brand,
    category: input.category,
    color: input.color,
    material: input.material || null,
    fit: input.fit || null,
    formality: input.formality,
    season: input.season,
    condition: input.condition,
    retailer: input.retailer,
    buy_url: input.buy_url,
    image_url: input.image_url,
    current_price: input.current_price,
    price: input.current_price, // legacy column, keep in sync
    original_price: input.original_price ?? null,
    availability: input.availability,
    source_type: input.source_type,
    source_name: input.source_name,
    source_url: input.source_url ?? null,
    image_rights_basis: input.image_rights_basis,
    verification_method: input.verification_method,
    affiliate: input.affiliate,
    affiliate_disclosure: input.affiliate_disclosure || null,
    description: input.description || null,
    verified_at: now,
    last_checked_at: now,
    // Server never lets the client flip is_demo or archived here.
    is_demo: false,
    archived: false,
  };
  if (input.kind) payload.kind = input.kind;
  return payload;
}

/**
 * ADD a verified catalog row. Non-demo, non-archived.
 */
export const addCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => catalogAddSchema.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = buildDbPayload(data);
    const { data: inserted, error } = await context.supabase
      .from("shop_catalog")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
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
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), data: catalogUpdateSchema }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    await loadNonDemoRow(context.supabase, data.id);
    const payload = buildDbPayload(data.data);
    // Never allow archived/is_demo change via update — they have their own
    // dedicated paths (and is_demo is immutable).
    delete payload.archived;
    delete payload.is_demo;
    const { error } = await context.supabase
      .from("shop_catalog")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
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
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    await loadNonDemoRow(context.supabase, data.id);
    const { error } = await context.supabase
      .from("shop_catalog")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ archived: data.archived } as any)
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
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        availability: z.enum([
          "in_stock",
          "low_stock",
          "preorder",
          "out_of_stock",
          "discontinued",
        ]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    await loadNonDemoRow(context.supabase, data.id);
    const { error } = await context.supabase
      .from("shop_catalog")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        availability: data.availability,
        last_checked_at: new Date().toISOString(),
      } as any)
      .eq("id", data.id)
      .eq("is_demo", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
