import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { extractFrame } from "./ffmpegService.js";
import { HttpError } from "../utils/http.js";

const THUMBNAIL_WIDTH = 1920;
const THUMBNAIL_HEIGHT = 1080;
const MIN_IMAGE_SIDE = 180;
const MAX_IMAGE_PIXELS = 8192 * 8192;
const formats = new Set(["jpeg", "png", "webp"]);

export const thumbnailKey = () => `thumbnail/${randomUUID()}.webp`;

// Letterboxing keeps every aspect ratio intact inside the 1920x1080 frame.
// rotate() applies EXIF orientation; metadata such as GPS is not copied.
const encode = (image) =>
  image
    .rotate()
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "contain", background: "#000" })
    .flatten({ background: "#000" })
    .webp({ quality: 82 })
    .toBuffer();

const invalidImage = () =>
  new HttpError(415, "Choose a JPEG, PNG, or WebP image.", "INVALID_IMAGE");

// The format comes from the decoded bytes, never the filename or browser MIME type.
export async function processThumbnailImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS });
  let info;
  try {
    info = await image.metadata();
  } catch {
    throw invalidImage();
  }
  if (!formats.has(info.format)) throw invalidImage();
  if (info.width * info.height > MAX_IMAGE_PIXELS)
    throw new HttpError(
      413,
      "This image has too many pixels. Use one up to 8192 × 8192.",
      "IMAGE_TOO_LARGE",
    );
  if (Math.min(info.width, info.height) < MIN_IMAGE_SIDE)
    throw new HttpError(
      422,
      `Thumbnail images must be at least ${MIN_IMAGE_SIDE} pixels on each side.`,
      "IMAGE_TOO_SMALL",
    );
  try {
    return await encode(image);
  } catch {
    throw new HttpError(
      415,
      "This image could not be read. Try a different file.",
      "INVALID_IMAGE",
    );
  }
}

export async function videoThumbnail(videoPath, duration, signal) {
  const framePath = path.join(path.dirname(videoPath), `${randomUUID()}.png`);
  try {
    // A frame a little way in avoids black leaders. Short clips use the first frame.
    const secondsIn = duration > 1 ? Math.min(duration * 0.1, 10) : 0;
    for (const seconds of new Set([secondsIn, 0])) {
      await extractFrame(videoPath, framePath, seconds, signal);
      const frame = await readFile(framePath).catch(() => null);
      // Extracted frames keep the source dimensions, so cap pixels like uploads.
      if (frame?.length) return await encode(sharp(frame, { limitInputPixels: MAX_IMAGE_PIXELS }));
    }
    throw new HttpError(
      422,
      "A thumbnail could not be created from this video.",
      "THUMBNAIL_FAILED",
    );
  } finally {
    await rm(framePath, { force: true }).catch(() => {});
  }
}
