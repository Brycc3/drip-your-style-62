import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the union of user ids that either (a) the current user has blocked
 * or (b) have blocked the current user. Used to hide their content from
 * feeds/profiles as a UX filter — the RLS on outfit_likes/comments is the
 * final enforcement layer.
 */
export async function getBlockedUserIds(uid: string | null): Promise<Set<string>> {
  if (!uid) return new Set();
  const [{ data: a, error: aError }, { data: b, error: bError }] = await Promise.all([
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", uid),
    supabase.from("user_blocks").select("blocker_id").eq("blocked_id", uid),
  ]);
  if (aError || bError) throw new Error("Could not load privacy filters. Please retry.");
  const set = new Set<string>();
  for (const r of a ?? []) set.add(r.blocked_id);
  for (const r of b ?? []) set.add(r.blocker_id);
  return set;
}

export function excludeBlocked<T extends { user_id: string }>(
  rows: T[],
  blocked: Set<string>,
): T[] {
  if (blocked.size === 0) return rows;
  return rows.filter((r) => !blocked.has(r.user_id));
}
