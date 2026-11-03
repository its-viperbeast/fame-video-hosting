import { randomUUID } from "node:crypto";
import path from "node:path";
import { rm, stat } from "node:fs/promises";
import { z } from "zod";
import Video from "../models/Video.js";
import { env } from "../config/env.js";
import { fileSchema, objectId, escapeRegex, assertMp4 } from "../utils/validation.js";
import { HttpError, ok } from "../utils/http.js";
import { assertFileMp4, remux } from "../services/ffmpegService.js";
import {
  processThumbnailImage,
  thumbnailKey,
  videoThumbnail,
} from "../services/thumbnailService.js";
import * as cleanup from "../services/cleanupService.js";
import * as ingests from "../services/ingestRegistry.js";
import * as storage from "../services/s3Service.js";

async function ownedVideo(req) {
  objectId.parse(req.params.id);
  const video = await Video.findOne({
    _id: req.params.id,
    owner: req.user.id,
    status: "ready",
  }).select("+key +thumbnailKey");
  if (!video) throw new HttpError(404, "Video not found.", "NOT_FOUND");
  return video;
}

// Object keys stay on the server; the client gets a short-lived signed URL.
async function present(video) {
  const json = video.toJSON();
  if (video.thumbnailKey) json.thumbnailUrl = await storage.thumbnailUrl(video.thumbnailKey);
  return json;
}

const thumbnailWarning =
  "The video was saved, but its thumbnail could not be created. Upload one from the video menu.";

const cancelled = () => new HttpError(499, "Upload cancelled.", "UPLOAD_CANCELLED");

// Runs before Multer, so a cancel stops the transfer as well as processing.
export function trackUpload(req, res, next) {
  const controller = new AbortController();
  req.uploadSignal = controller.signal;
  const id = req.get("x-upload-id");
  if (id && !z.uuid().safeParse(id).success)
    return next(new HttpError(400, "Invalid upload ID.", "VALIDATION_ERROR"));
  // A response that closes before it finishes means the client gave up.
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
    if (id) ingests.settle(req.user.id, id, controller);
  });
  if (id) {
    req.uploadId = id;
    req.uploadController = controller;
    ingests.start(req.user.id, id, controller);
    // Reply with the cancel, then drop the socket so Multer deletes the partial file.
    controller.signal.addEventListener(
      "abort",
      () => {
        if (req.complete) return;
        if (!res.headersSent) {
          res.status(499).json({
            success: false,
            error: {
              code: "UPLOAD_CANCELLED",
              message: "Upload cancelled.",
              requestId: randomUUID(),
            },
          });
        }
        req.destroy();
      },
      { once: true },
    );
  }
  next();
}

export async function ingest(req, res) {
  const signal = req.uploadSignal;
  if (signal.aborted) throw cancelled();
  if (!req.file) throw new HttpError(400, "Choose an MP4 video to upload.");
  const duration = Number(req.body.duration);
  const input = fileSchema(env.MAX_UPLOAD_BYTES).parse({
    name: req.file.originalname,
    size: req.file.size,
    mimeType: "video/mp4",
    duration: Number.isFinite(duration) && duration >= 0 ? duration : 0,
  });
  const source = req.file.path;
  const output = path.join(path.dirname(source), `${randomUUID()}.mp4`);
  const key = `videos/${randomUUID()}.mp4`;
  const tracked = [];
  try {
    await assertFileMp4(source);
    await remux(source, output, signal);
    await assertFileMp4(output);
    const info = await stat(output);
    if (info.size < 12 || info.size > env.MAX_UPLOAD_BYTES + 8 * 1024 ** 2)
      throw new HttpError(422, "Prepared video is an unexpected size.", "INVALID_VIDEO");
    // A playable video is kept even if its thumbnail fails; the panel offers a custom upload.
    let thumbnail, warning;
    try {
      thumbnail = await videoThumbnail(output, input.duration, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      console.error({ thumbnail: "generate", message: error.message });
      warning = thumbnailWarning;
    }
    if (signal.aborted) throw cancelled();
    const thumbKey = thumbnail && thumbnailKey();
    tracked.push(key, ...(thumbKey ? [thumbKey] : []));
    await cleanup.track(tracked, req.user.id);
    await storage.putFile(key, output, info.size, signal);
    let storedThumbKey;
    if (thumbKey) {
      try {
        await storage.putThumbnail(thumbKey, thumbnail, signal);
        storedThumbKey = thumbKey;
      } catch (error) {
        if (signal.aborted) throw error;
        console.error({ thumbnail: "store", code: error.name });
        warning = thumbnailWarning;
      }
    }
    if (signal.aborted) throw cancelled();
    const video = await Video.create({
      owner: req.user.id,
      name: input.name,
      key,
      thumbnailKey: storedThumbKey,
      size: info.size,
      mimeType: "video/mp4",
      duration: input.duration,
    });
    // No await separates this check from recording the result, so a cancel
    // either lands here and is rolled back, or finds the finished video later.
    const kept = req.uploadId
      ? ingests.finish(req.user.id, req.uploadId, req.uploadController, video.id)
      : !signal.aborted;
    if (!kept) {
      await deleteOwnedVideo(req.user.id, video.id).catch((error) =>
        console.error({ rollback: video.id, code: error.name, message: error.message }),
      );
      throw cancelled();
    }
    await cleanup.reconcile(tracked);
    ok(res, { video: await present(video), warning }, 201);
  } catch (err) {
    // Objects are deleted only if no saved video references them.
    if (tracked.length) await cleanup.reconcile(tracked);
    throw signal.aborted ? cancelled() : err;
  } finally {
    await rm(source, { force: true }).catch(() => {});
    await rm(output, { force: true }).catch(() => {});
  }
}

export async function validateHeader(req, res) {
  if (!req.file) throw new HttpError(400, "A video header sample is required.");
  assertMp4(req.file.buffer);
  ok(res, { valid: true });
}

function recentCutoff() {
  return new Date(Date.now() - 24 * 3600000);
}

export async function list(req, res) {
  const q = z
    .object({
      search: z.string().max(180).default(""),
      sort: z.enum(["newest", "oldest", "name", "size"]).default("newest"),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(48).default(6),
      filter: z.enum(["all", "recent", "favorites"]).default("all"),
    })
    .parse(req.query);
  const base = { owner: req.user.id, status: "ready" },
    query = { ...base };
  if (q.search) query.name = { $regex: escapeRegex(q.search), $options: "i" };
  if (q.filter === "favorites") query.favorite = true;
  if (q.filter === "recent") query.createdAt = { $gte: recentCutoff() };
  const sorts = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    name: { name: 1, _id: 1 },
    size: { size: -1, _id: -1 },
  };
  const [videos, total, aggregate, favorites, recent] = await Promise.all([
    Video.find(query)
      .select("+thumbnailKey")
      .sort(sorts[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    Video.countDocuments(query),
    Video.aggregate([
      { $match: base },
      { $group: { _id: null, total: { $sum: 1 }, size: { $sum: "$size" } } },
    ]),
    Video.countDocuments({ ...base, favorite: true }),
    Video.countDocuments({ ...base, createdAt: { $gte: recentCutoff() } }),
  ]);
  ok(res, {
    videos: await Promise.all(videos.map(present)),
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    },
    stats: { total: aggregate[0]?.total || 0, size: aggregate[0]?.size || 0, favorites, recent },
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    maxThumbnailBytes: env.MAX_THUMBNAIL_BYTES,
  });
}

export async function details(req, res) {
  ok(res, { video: await present(await ownedVideo(req)) });
}

export async function play(req, res) {
  ok(res, await storage.playbackUrl(await ownedVideo(req)));
}

export async function download(req, res) {
  ok(res, await storage.playbackUrl(await ownedVideo(req), true));
}

export async function update(req, res) {
  objectId.parse(req.params.id);
  const input = z
    .object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(180)
        .refine((value) => !/[\x00-\x1f\x7f/\\]/.test(value), "Invalid video name")
        .optional(),
      note: z.string().trim().max(5000).optional(),
      favorite: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, "Choose a field to update")
    .parse(req.body);
  // Only metadata changes here; storage keys and objects stay untouched.
  const video = await Video.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.id, status: "ready" },
    { $set: input },
    { new: true, runValidators: true },
  ).select("+thumbnailKey");
  if (!video) throw new HttpError(404, "Video not found.", "NOT_FOUND");
  ok(res, { video: await present(video) });
}

export async function replaceThumbnail(req, res) {
  if (!req.file) throw new HttpError(400, "Choose an image for the thumbnail.");
  const video = await ownedVideo(req);
  const image = await processThumbnailImage(req.file.buffer);
  const previous = video.thumbnailKey;
  const key = thumbnailKey();
  // Both keys are tracked up front. Whichever one ends up unreferenced is
  // deleted, now or by the worker if this process stops partway.
  const tracked = [key, ...(previous ? [previous] : [])];
  await cleanup.track(tracked, req.user.id);
  let updated;
  try {
    try {
      await storage.putThumbnail(key, image);
    } catch (error) {
      console.error({ thumbnail: "store", code: error.name });
      throw new HttpError(
        502,
        "The new thumbnail could not be uploaded. Your current thumbnail was kept.",
        "THUMBNAIL_UPLOAD_FAILED",
      );
    }
    // Swap only if the video is still ready and no other replacement won the race.
    updated = await Video.findOneAndUpdate(
      { _id: video._id, owner: req.user.id, status: "ready", thumbnailKey: previous ?? null },
      { $set: { thumbnailKey: key } },
      { new: true },
    ).select("+thumbnailKey");
  } finally {
    // After a successful swap, this deletes the previous thumbnail. After a
    // failure, it deletes the new one and keeps the current thumbnail.
    await cleanup.reconcile(tracked);
  }
  if (!updated)
    throw new HttpError(
      409,
      "This video changed while the thumbnail was uploading. Refresh and try again.",
      "THUMBNAIL_CONFLICT",
    );
  ok(res, { video: await present(updated) });
}

export async function cancelUpload(req, res) {
  const uploadId = z.uuid().parse(req.params.uploadId);
  const videoId = ingests.cancel(req.user.id, uploadId);
  // The upload finished just before the cancel arrived, so the client never
  // showed it as completed. Honor the cancel by removing it.
  if (videoId) await deleteOwnedVideo(req.user.id, videoId);
  ok(res, { cancelled: true, removed: Boolean(videoId) });
}

export async function remove(req, res) {
  objectId.parse(req.params.id);
  const video = await deleteOwnedVideo(req.user.id, req.params.id);
  ok(res, { deleted: true, id: video.id });
}

async function deleteOwnedVideo(owner, id) {
  // Marking the record hides it and blocks thumbnail swaps. The keys to delete
  // come from the stored record. A retry is allowed while it is still deleting.
  const video = await Video.findOneAndUpdate(
    { _id: id, owner },
    { $set: { status: "deleting" } },
    { new: true },
  ).select("+key +thumbnailKey");
  if (!video) throw new HttpError(404, "Video not found.", "NOT_FOUND");
  try {
    await cleanup.destroyVideo(video);
  } catch (error) {
    console.error({ delete: video.id, code: error.name, message: error.message });
    throw new HttpError(
      503,
      "This video could not be fully deleted. Try again. Frame also retries automatically.",
      "DELETE_INCOMPLETE",
    );
  }
  return video;
}
