import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminSupabase = SupabaseClient<Database>;

export function assertAdminAuthorized(isAdmin: boolean): void {
  if (!isAdmin) throw new Error("Admin only");
}

/**
 * Reusable server-side admin check. The RPC executes with the authenticated
 * caller and is backed by profiles.is_admin; routes may still use a client
 * redirect for UX, but no privileged server operation relies on that redirect.
 */
export async function requireServerAdmin(supabase: AdminSupabase, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("is_admin", { _uid: userId });
  if (error) throw new Error(error.message);
  assertAdminAuthorized(data === true);
}
