import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, wrap } from "../utils/http.js";
import * as videos from "../controllers/videoController.js";

const router = Router();
router.use(requireAuth);
export const uploadDir = path.join(os.tmpdir(), "frame-uploads");

// Created lazily so importing the router has no filesystem side effects.
// 0o700 keeps in-progress uploads private from other local users.
export function ensureUploadDir() {
  mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  chmodSync(uploadDir, 0o700);
}

const headerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4096, files: 1, fields: 0, parts: 1 },
});
// The declared type is only a first filter; sharp checks the decoded bytes.
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_THUMBNAIL_BYTES, files: 1, fields: 0, parts: 1 },
  fileFilter(_req, file, cb) {
    if (
      !/^image\/(jpeg|png|webp)$/.test(file.mimetype) ||
      !/\.(jpe?g|png|webp)$/i.test(file.originalname || "")
    ) {
      cb(new HttpError(415, "Choose a JPEG, PNG, or WebP image.", "INVALID_IMAGE"));
      return;
    }
    cb(null, true);
  },
});
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        ensureUploadDir();
        cb(null, uploadDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.mp4`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 2, parts: 4 },
  fileFilter(_req, file, cb) {
    // Full name rules run here so a bad name doesn't cost a whole upload.
    const name = String(file.originalname || "").trim();
    if (!/\.mp4$/i.test(name)) {
      cb(new HttpError(415, "Only .mp4 files are allowed.", "INVALID_VIDEO"));
      return;
    }
    if (name.length < 5 || name.length > 180 || /[\x00-\x1f/\\]/.test(name)) {
      cb(new HttpError(400, "The file name is not valid.", "INVALID_VIDEO"));
      return;
    }
    cb(null, true);
  },
});
router.post("/upload", videos.trackUpload, videoUpload.single("file"), wrap(videos.ingest));
router.post("/upload/:uploadId/cancel", wrap(videos.cancelUpload));
router.post("/validate", headerUpload.single("header"), wrap(videos.validateHeader));
router.get("/", wrap(videos.list));
router.get("/:id", wrap(videos.details));
router.get("/:id/play", wrap(videos.play));
router.get("/:id/download", wrap(videos.download));
router.patch("/:id", wrap(videos.update));
router.put("/:id/thumbnail", thumbnailUpload.single("thumbnail"), wrap(videos.replaceThumbnail));
router.delete("/:id", wrap(videos.remove));
export default router;
