export const CLOSET_IMAGE_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export function validateClosetImage(file: { size: number; type: string }): string | null {
  if (!(file.type in CLOSET_IMAGE_MIME))
    return "Choose a JPEG, PNG or WebP photo. Convert HEIC photos before uploading.";
  if (file.size <= 0 || file.size > 8 * 1024 * 1024)
    return "Choose a photo under 8 MB that is not empty.";
  return null;
}
