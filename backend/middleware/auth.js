import jwt from "jsonwebtoken";
import { timingSafeEqual, scryptSync } from "node:crypto";
import { env } from "../config/env.js";
import Admin from "../models/Admin.js";
import { HttpError } from "../utils/http.js";
export function verifyPassword(password, hash) {
  const [salt, expected] = hash.split(":");
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(derived, Buffer.from(expected, "hex"));
}
function bearerToken(req) {
  const [scheme, token] = (req.get("authorization") || "").split(" ");
  return scheme === "Bearer" && token ? token : "";
}
export async function requireAuth(req, _res, next) {
  try {
    const user = jwt.verify(bearerToken(req), env.SESSION_SECRET, {
      algorithms: ["HS256"],
      audience: "frame-api",
      issuer: "frame",
    });
    const admin =
      user.role === "admin" &&
      (await Admin.findOne({ email: String(user.sub || "").toLowerCase() }));
    if (!admin || (user.sessionVersion ?? 0) !== (admin.sessionVersion ?? 0))
      throw new Error("Unauthorized");
    req.user = {
      id: admin.email,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    next();
  } catch {
    next(new HttpError(401, "Please sign in to continue.", "UNAUTHORIZED"));
  }
}
