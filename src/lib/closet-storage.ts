import { supabase } from "@/integrations/supabase/client";

const BUCKET = "closet";

export async function uploadClosetImage(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

/** Owner-only signed URL. Anonymous visitors cannot use this. */
export async function getSignedUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

/** Path-keyed map. Prefer `getSignedUrlsByItem` when callers already have items with ids. */
export async function getSignedUrls(
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Record<string, string>> {
  const uniq = Array.from(new Set(paths.filter(Boolean)));
  const entries = await Promise.all(
    uniq.map(async (p) => [p, (await getSignedUrl(p, expiresIn)) ?? ""] as const),
  );
  return Object.fromEntries(entries.filter(([, u]) => u));
}

/**
 * Return a map keyed by the item's own id (not the storage path).
 * Every caller that renders per-item thumbnails should use this to avoid
 * blank tiles caused by mixing id-keyed reads with path-keyed maps.
 */
export async function getSignedUrlsByItem<T extends { id: string; image_url: string | null }>(
  items: T[],
  expiresIn = 60 * 60,
): Promise<Record<string, string>> {
  const withPath = items.filter((i) => !!i.image_url);
  const byPath = await getSignedUrls(withPath.map((i) => i.image_url!) as string[], expiresIn);
  const out: Record<string, string> = {};
  for (const i of withPath) {
    const url = byPath[i.image_url!];
    if (url) out[i.id] = url;
  }
  return out;
}

export async function deleteClosetImage(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
