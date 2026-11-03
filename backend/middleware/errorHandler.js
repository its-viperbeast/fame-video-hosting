import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http.js";

export function errorHandler(err, req, res, _next) {
  const requestId = randomUUID();
  let status = err.status || 500,
    message = err.message,
    code = err.code || "INTERNAL_ERROR";
  if (err.type === "entity.parse.failed") {
    status = 400;
    message = "The request body must be valid JSON.";
    code = "INVALID_JSON";
  }
  if (err instanceof ZodError) {
    status = 400;
    message = err.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ");
    code = "VALIDATION_ERROR";
  }
  if (err.name === "CastError") {
    status = 400;
    message = "Invalid resource ID";
    code = "VALIDATION_ERROR";
  }
  if (err.name === "MulterError") {
    status = 400;
    message = `The upload request is not valid: ${err.message}.`;
    code = "INVALID_UPLOAD";
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message =
      err.field === "header"
        ? "Header sample exceeds 4 KB"
        : err.field === "thumbnail"
          ? `This image is larger than the ${+(env.MAX_THUMBNAIL_BYTES / 1024 ** 2).toFixed(1)} MB limit.`
          : "This video is larger than the upload limit.";
    code = "FILE_TOO_LARGE";
  }
  // After a cancel, the aborted transfer, ffmpeg run or storage call is the cancel itself.
  if (req.uploadSignal?.aborted) {
    status = 499;
    message = "Upload cancelled.";
    code = "UPLOAD_CANCELLED";
  }
  if (status >= 500) {
    console.error({ requestId, method: req.method, code: err.name, message: err.message });
    // Messages written for HttpErrors are safe to show; anything else is not.
    if (!(err instanceof HttpError)) message = "Something went wrong. Please try again.";
  }
  if (res.headersSent) {
    // A partial response is already on its way; close the socket so the client doesn't hang.
    res.end();
    return;
  }
  res.status(status).json({ success: false, error: { code, message, requestId } });
}
