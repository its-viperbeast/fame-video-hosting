export class HttpError extends Error {
  constructor(status, message, code = "REQUEST_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
