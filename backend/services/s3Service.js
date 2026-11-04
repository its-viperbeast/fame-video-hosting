import { createReadStream } from "node:fs";
import {
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/aws.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";

const base = (key) => ({ Bucket: env.AWS_S3_BUCKET, Key: key });

const sign = (command, options = {}) =>
  getSignedUrl(s3, command, { expiresIn: env.PRESIGNED_URL_TTL_SECONDS, ...options });

export async function putFile(key, filePath, size, signal) {
  const body = createReadStream(filePath);
  try {
    // B2 rejects the tagging and If-None-Match headers on PutObject.
    await s3.send(
      new PutObjectCommand({
        ...base(key),
        Body: body,
        ContentLength: size,
        ContentType: "video/mp4",
      }),
      { abortSignal: signal },
    );
  } catch (error) {
    body.destroy();
    throw error;
  }
}

export async function putThumbnail(key, body, signal) {
  await s3.send(
    new PutObjectCommand({
      ...base(key),
      Body: body,
      ContentLength: body.length,
      ContentType: "image/webp",
    }),
    { abortSignal: signal },
  );
  // Confirm the stored object before any database record points at it.
  const head = await s3.send(new HeadObjectCommand(base(key)), { abortSignal: signal });
  if (head.ContentLength !== body.length || head.ContentType !== "image/webp")
    throw new HttpError(502, "The thumbnail was not stored correctly.", "STORAGE_MISMATCH");
}

// No object tagging: B2 ignores the ?tagging subresource and treats
// PutObjectTagging as PutObject, replacing the video with the tag XML.
// Orphans are tracked in MongoDB instead (see cleanupService).
async function objectVersions(key) {
  const versions = [],
    markers = [];
  let KeyMarker, VersionIdMarker;
  for (;;) {
    const page = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: env.AWS_S3_BUCKET,
        Prefix: key,
        KeyMarker,
        VersionIdMarker,
      }),
    );
    // Prefix searches can include other files. Only this exact stored key is owned.
    for (const [entries, target] of [
      [page.Versions, versions],
      [page.DeleteMarkers, markers],
    ]) {
      for (const entry of entries || []) {
        if (entry.Key !== key) continue;
        if (!entry.VersionId)
          throw new HttpError(502, "Storage did not return an object version.", "STORAGE_MISMATCH");
        target.push(entry.VersionId);
      }
    }
    if (!page.IsTruncated) return { versions, markers };
    if (
      !page.NextKeyMarker ||
      (page.NextKeyMarker === KeyMarker && page.NextVersionIdMarker === VersionIdMarker)
    )
      throw new HttpError(
        502,
        "Storage could not finish listing object versions.",
        "STORAGE_MISMATCH",
      );
    KeyMarker = page.NextKeyMarker;
    VersionIdMarker = page.NextVersionIdMarker;
  }
}

// An object that is already gone counts as deleted, so retries can finish.
export async function deleteObject(key) {
  const { versions, markers } = await objectVersions(key);
  // B2's name-only DELETE just hides a file. Explicit versions free the storage.
  // Leave hide markers until all file versions are gone to avoid uncovering old data.
  for (const VersionId of [...versions, ...markers]) {
    try {
      await s3.send(new DeleteObjectCommand({ ...base(key), VersionId }));
    } catch (error) {
      if (!["NoSuchKey", "NoSuchVersion"].includes(error.name)) throw error;
    }
  }
  const remaining = await objectVersions(key);
  if (remaining.versions.length || remaining.markers.length)
    throw new HttpError(
      502,
      "Storage still contains object versions. Please retry.",
      "DELETE_INCOMPLETE",
    );
}

// With MEDIA_BASE_URL set, playback and thumbnails come from that public origin
// (Cloudflare in front of the bucket) as <origin>/<object key>. Those links are
// public and never expire. Downloads stay signed so the response can carry
// Content-Disposition with the video's name.
const mediaUrl = (key) =>
  `${env.MEDIA_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function playbackUrl(video, download = false) {
  if (env.MEDIA_BASE_URL && !download) return { url: mediaUrl(video.key) };
  // RFC 5987 filename*; encodeURIComponent leaves ' ( ) * unescaped.
  const fileName = encodeURIComponent(video.name).replace(
    /['()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16),
  );
  const url = await sign(
    new GetObjectCommand({
      ...base(video.key),
      ResponseContentType: "video/mp4",
      ResponseContentDisposition: download
        ? `attachment; filename="video.mp4"; filename*=UTF-8''${fileName}`
        : "inline",
      ResponseCacheControl: "private, no-store",
    }),
  );
  return {
    url,
    expiresAt: new Date(Date.now() + env.PRESIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

// Signing from the start of a half-TTL window keeps the URL stable across list
// requests, so the browser reuses its cached image. Each replacement has a new
// key, which changes the URL, so a cached thumbnail is never stale.
export async function thumbnailUrl(key) {
  if (env.MEDIA_BASE_URL) return mediaUrl(key);
  const ttl = env.PRESIGNED_URL_TTL_SECONDS;
  const window = Math.floor(ttl / 2) * 1000;
  return sign(
    new GetObjectCommand({
      ...base(key),
      ResponseContentType: "image/webp",
      ResponseCacheControl: `private, max-age=${ttl}, immutable`,
    }),
    { expiresIn: ttl, signingDate: new Date(Math.floor(Date.now() / window) * window) },
  );
}
