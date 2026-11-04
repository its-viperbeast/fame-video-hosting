import { z } from "zod";
import { HttpError } from "./http.js";

export const fileSchema = (max) =>
  z
    .object({
      name: z
        .string()
        .trim()
        .min(5)
        .max(180)
        .regex(/\.mp4$/i, "Only .mp4 files are allowed")
        .refine((s) => !/[\x00-\x1f/\\]/.test(s), "Invalid filename"),
      size: z.number().int().min(12).max(max),
      mimeType: z.literal("video/mp4"),
      duration: z.number().min(0).max(604800).optional().default(0),
    })
    .strict();

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource ID");

const mp4Brands = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "dash",
  "M4V ",
  "MSNV",
]);

export function validateMp4Header(bytes) {
  const data = Buffer.from(bytes);
  if (data.length < 16 || data.toString("ascii", 4, 8) !== "ftyp") return false;
  const boxSize = data.readUInt32BE(0);
  if (boxSize < 16 || boxSize > data.length) return false;
  for (let offset = 8; offset + 4 <= boxSize; offset += 4) {
    if (offset !== 12 && mp4Brands.has(data.toString("ascii", offset, offset + 4))) return true;
  }
  return false;
}

export function assertMp4(bytes) {
  if (!validateMp4Header(bytes))
    throw new HttpError(415, "The file is not a supported MP4 video.", "INVALID_VIDEO");
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
