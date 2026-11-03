// Mirrors the backend checks for fast feedback. The server still decodes and validates every image.
export const THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MIN_THUMBNAIL_SIDE = 180;

export function thumbnailFileError(file, maxSize) {
  if (!THUMBNAIL_TYPES.includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name))
    return "Choose a JPEG, PNG, or WebP image.";
  if (!file.size) return "This image is empty.";
  if (file.size > maxSize) return `Images can be up to ${+(maxSize / 1024 ** 2).toFixed(1)} MB.`;
  return "";
}

export function thumbnailSizeError({ width, height }) {
  return Math.min(width, height) < MIN_THUMBNAIL_SIDE
    ? `Thumbnail images must be at least ${MIN_THUMBNAIL_SIDE} pixels on each side.`
    : "";
}
