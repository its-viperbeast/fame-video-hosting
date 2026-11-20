import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "REQUEST_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const ok = (res: Response, data: unknown, status = 200) =>
  res.status(status).json({ success: true, data });

// Set by requireAuth, so only handlers mounted behind it may use this type.
export type AuthedRequest = Request & { user: NonNullable<Request["user"]> };
// Set by trackUpload, which runs after requireAuth on the upload route.
export type UploadRequest = AuthedRequest & { uploadSignal: AbortSignal };

type AsyncHandler<R extends Request> = (
  req: R,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

// The cast is the one place that trusts the router to run requireAuth first.
export const wrap =
  <R extends Request = Request>(fn: AsyncHandler<R>): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req as R, res, next)).catch(next);

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown error");
}
