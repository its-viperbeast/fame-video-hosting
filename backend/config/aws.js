import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";
// Backblaze B2 speaks the S3 API at s3.<region>.backblazeb2.com.
// Default AWS SDK checksum headers are rejected by B2, so checksums stay opt-in.
export const s3 = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
