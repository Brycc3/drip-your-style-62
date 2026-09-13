/** Supabase resolves HTTP errors rather than rejecting; never treat them as an empty wardrobe. */
export function requireQuerySuccess<T extends { error?: unknown }[]>(results: T): T {
  if (results.some((result) => result.error))
    throw new Error("Could not load your data. Check your connection and retry.");
  return results;
}
