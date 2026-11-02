import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1),
  AWS_REGION: z.string().min(1),
  S3_ENDPOINT: z.url(),
  AWS_S3_BUCKET: z.string().min(3),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  FRONTEND_URL: z.url(),
  APP_BASE_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
  AUTH_EMAIL: z.email(),
  AUTH_PASSWORD_HASH: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(5 * 1024 ** 3)
    .default(2 * 1024 ** 3),
  MAX_THUMBNAIL_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(25 * 1024 ** 2)
    .default(10 * 1024 ** 2),
  PRESIGNED_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  MEDIA_BASE_URL: z.url().optional(),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFMPEG_ARGS: z
    .string()
    .min(1)
    .default(
      "-hide_banner -nostdin -i pipe:0 -map 0:V -map 0:a? -map 0:s? -c copy -movflags +faststart -f mp4 -y pipe:1",
    )
    .refine(
      (value) => value.includes("pipe:0") && value.includes("pipe:1"),
      "FFMPEG_ARGS must include pipe:0 and pipe:1",
    ),
});
export function parseEnv(input) {
  const value = schema.parse({
    ...input,
    MEDIA_BASE_URL: input.MEDIA_BASE_URL || undefined,
  });
  if (value.MEDIA_BASE_URL) {
    const media = new URL(value.MEDIA_BASE_URL);
    if (media.protocol !== "https:" || media.search || media.hash)
      throw new Error("MEDIA_BASE_URL must be an https:// origin or path");
    value.MEDIA_BASE_URL = media.href.replace(/\/+$/, "");
  }
  const endpoint = new URL(value.S3_ENDPOINT);
  const expectedHost = `s3.${value.AWS_REGION}.backblazeb2.com`;
  if (endpoint.protocol !== "https:" || endpoint.hostname !== expectedHost)
    throw new Error(`S3_ENDPOINT must be https://${expectedHost}`);
  if (
    value.NODE_ENV === "production" &&
    !value.FRONTEND_URL.startsWith("https://")
  )
    throw new Error("Production requires HTTPS");
  return value;
}
export const env = parseEnv(process.env);
