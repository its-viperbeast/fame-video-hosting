import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { randomBytes, scryptSync } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import Admin from "../models/Admin.js";
import { requireAuth, verifyPassword } from "../middleware/auth.js";
import { publicAdmin } from "../services/adminService.js";
import { ok, wrap, HttpError } from "../utils/http.js";

const attemptLimit = (message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message } },
  });

const signToken = (admin) =>
  jwt.sign({ role: admin.role, sessionVersion: admin.sessionVersion ?? 0 }, env.SESSION_SECRET, {
    subject: admin.email,
    expiresIn: "8h",
    audience: "frame-api",
    issuer: "frame",
    algorithm: "HS256",
  });

const router = Router();
router.post(
  "/login",
  attemptLimit("Too many sign-in attempts. Try again in 15 minutes."),
  wrap(async (req, res) => {
    const input = z
      .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
      .parse(req.body);
    const admin = await Admin.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
    if (!admin || !verifyPassword(input.password, admin.passwordHash))
      throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    ok(res, { user: publicAdmin(admin), token: signToken(admin) });
  }),
);
router.get("/me", requireAuth, (req, res) => ok(res, { user: publicAdmin(req.user) }));
router.post(
  "/change-password",
  attemptLimit("Too many password attempts. Try again in 15 minutes."),
  requireAuth,
  wrap(async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z.string().min(12).max(256),
      })
      .parse(req.body);
    const admin = await Admin.findOne({ email: req.user.email }).select("+passwordHash");
    if (!admin || !verifyPassword(input.currentPassword, admin.passwordHash))
      throw new HttpError(401, "Current password is incorrect.", "INVALID_CREDENTIALS");
    if (input.currentPassword === input.newPassword)
      throw new HttpError(400, "Choose a different password.", "VALIDATION_ERROR");
    const salt = randomBytes(16).toString("hex");
    admin.passwordHash = `${salt}:${scryptSync(input.newPassword, salt, 64).toString("hex")}`;
    admin.sessionVersion = (admin.sessionVersion ?? 0) + 1;
    await admin.save();
    ok(res, { changed: true, token: signToken(admin) });
  }),
);
// Tokens are stateless and carried by the client, so signing out only drops the
// stored token there. The endpoint is kept so the client can acknowledge it.
router.post("/logout", (_req, res) => ok(res, { loggedOut: true }));
export default router;
