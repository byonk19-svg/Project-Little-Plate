const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 5 * 1024 * 1024;

export function normalizeExternalImageUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Image URLs must use http:// or https://");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Image URLs must use http:// or https:// without credentials"
    );
  }
  url.hash = "";
  return url.toString();
}

export function validateImageFile(
  file: Pick<File, "type" | "size">
): { ok: true } | { ok: false; message: string } {
  if (!allowedMimeTypes.has(file.type)) {
    return { ok: false, message: "Use a JPG, PNG, or WebP image." };
  }
  if (file.size > maxImageBytes) {
    return { ok: false, message: "Images must be 5 MB or smaller." };
  }
  return { ok: true };
}

export const maxRecipeImageBytes = maxImageBytes;
