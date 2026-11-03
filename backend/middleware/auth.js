import jwt from "jsonwebtoken";
import { timingSafeEqual, scryptSync } from "node:crypto";
import { env } from "../config/env.js";
import Admin from "../models/Admin.js";
import { HttpError } from "../utils/http.js";

export function verifyPassword(password, hash) {
  const [salt, expected] = String(hash).split(":");
  const expectedBuffer = Buffer.from(expected || "", "hex");
  if (!salt || expectedBuffer.length !== 64) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), expectedBuffer);
}

function bearerToken(req) {
  const [scheme, token] = (req.get("authorization") || "").split(" ");
  return scheme === "Bearer" && token ? token : "";
}

const unauthorized = () => new HttpError(401, "Please sign in to continue.", "UNAUTHORIZED");

export async function requireAuth(req, _res, next) {
  let user;
  try {
    user = jwt.verify(bearerToken(req), env.SESSION_SECRET, {
      algorithms: ["HS256"],
      audience: "frame-api",
      issuer: "frame",
    });
  } catch {
    return next(unauthorized());
  }
  try {
    const admin =
      user.role === "admin" &&
      (await Admin.findOne({ email: String(user.sub || "").toLowerCase() }));
    if (!admin || (user.sessionVersion ?? 0) !== (admin.sessionVersion ?? 0))
      return next(unauthorized());
    req.user = { id: admin.email, email: admin.email, name: admin.name, role: admin.role };
    next();
  } catch (error) {
    // Database failures must surface as 500s, not look like auth failures.
    next(error);
  }
}
