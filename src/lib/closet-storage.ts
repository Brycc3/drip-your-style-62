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

/** Storage path -> short-lived signed URL for private bucket. */
export async function getSignedUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteClosetImage(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
