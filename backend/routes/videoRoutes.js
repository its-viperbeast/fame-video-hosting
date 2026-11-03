import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, wrap } from "../utils/http.js";
import * as c from "../controllers/videoController.js";

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
router.post("/upload", c.trackUpload, videoUpload.single("file"), wrap(c.ingest));
router.post("/upload/:uploadId/cancel", wrap(c.cancelUpload));
router.post("/validate", headerUpload.single("header"), wrap(c.validateHeader));
router.get("/", wrap(c.list));
router.get("/:id", wrap(c.details));
router.get("/:id/play", wrap(c.play));
router.get("/:id/download", wrap(c.download));
router.patch("/:id", wrap(c.update));
router.put("/:id/thumbnail", thumbnailUpload.single("thumbnail"), wrap(c.replaceThumbnail));
router.delete("/:id", wrap(c.remove));
export default router;
