import { createReadStream } from "node:fs";
import {
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  CreateMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/aws.js";
import { env } from "../config/env.js";
import { assertMp4 } from "../utils/validation.js";
import { HttpError } from "../utils/http.js";
const base = (key) => ({ Bucket: env.AWS_S3_BUCKET, Key: key });
const sign = (command, options = {}) =>
  getSignedUrl(s3, command, {
    expiresIn: env.PRESIGNED_URL_TTL_SECONDS,
    ...options,
  });
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
  const head = await s3.send(new HeadObjectCommand(base(key)), {
    abortSignal: signal,
  });
  if (head.ContentLength !== body.length || head.ContentType !== "image/webp")
    throw new HttpError(
      502,
      "The thumbnail was not stored correctly.",
      "STORAGE_MISMATCH",
    );
}
export async function createUpload(session) {
  const options = {
    ...base(session.key),
    ContentType: "video/mp4",
    Tagging: "status=pending",
    Metadata: {
      "upload-id": session.id,
      owner: Buffer.from(session.owner).toString("base64url"),
    },
  };
  if (session.size >= 100 * 1024 ** 2) {
    const data = await s3.send(new CreateMultipartUploadCommand(options));
    return { multipartId: data.UploadId, partSize: 16 * 1024 ** 2 };
  }
  const url = await sign(
    new PutObjectCommand({
      ...options,
      ContentLength: session.size,
      IfNoneMatch: "*",
    }),
    {
      signableHeaders: new Set([
        "content-type",
        "content-length",
        "if-none-match",
      ]),
    },
  );
  return {
    url,
    headers: { "Content-Type": "video/mp4", "If-None-Match": "*" },
  };
}
export async function verifyObject(session) {
  const head = await s3.send(new HeadObjectCommand(base(session.key)));
  if (
    head.ContentLength !== session.size ||
    head.ContentType !== "video/mp4" ||
    head.Metadata?.["upload-id"] !== session.id
  )
    throw new HttpError(
      422,
      "Uploaded file does not match its upload session.",
      "UPLOAD_MISMATCH",
    );
  const content = await s3.send(
    new GetObjectCommand({ ...base(session.key), Range: "bytes=0-4095" }),
  );
  assertMp4(await content.Body.transformToByteArray());
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
          throw new HttpError(
            502,
            "Storage did not return an object version.",
            "STORAGE_MISMATCH",
          );
        target.push(entry.VersionId);
      }
    }
    if (!page.IsTruncated) return { versions, markers };
    if (
      !page.NextKeyMarker ||
      (page.NextKeyMarker === KeyMarker &&
        page.NextVersionIdMarker === VersionIdMarker)
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
export async function playbackUrl(
  video,
  download = false,
  ttl = env.PRESIGNED_URL_TTL_SECONDS,
) {
  if (env.MEDIA_BASE_URL && !download) return { url: mediaUrl(video.key) };
  const disposition = download
    ? `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(video.name).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16))}`
    : "inline";
  const url = await sign(
    new GetObjectCommand({
      ...base(video.key),
      ResponseContentType: "video/mp4",
      ResponseContentDisposition: disposition,
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn: ttl },
  );
  return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
}
// Signing from the start of a half-TTL window keeps the URL stable across list
// requests, so the browser reuses its cached image. Each replacement has a new
// key, which changes the URL, so a cached thumbnail is never stale.
export async function thumbnailUrl(key, ttl = env.PRESIGNED_URL_TTL_SECONDS) {
  if (env.MEDIA_BASE_URL) return mediaUrl(key);
  const window = Math.floor(ttl / 2) * 1000;
  return sign(
    new GetObjectCommand({
      ...base(key),
      ResponseContentType: "image/webp",
      ResponseCacheControl: `private, max-age=${ttl}, immutable`,
    }),
    {
      expiresIn: ttl,
      signingDate: new Date(Math.floor(Date.now() / window) * window),
    },
  );
}
