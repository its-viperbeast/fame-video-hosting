import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import Admin from "../models/Admin.js";
import { requireAuth, verifyPassword } from "../middleware/auth.js";
import { publicAdmin } from "../services/adminService.js";
import { ok, wrap, HttpError, type AuthedRequest } from "../utils/http.js";

const attemptLimit = (message: string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message } },
  });

const signToken = (admin: { email: string; role: string; sessionVersion?: number | null }) =>
  jwt.sign({ role: admin.role, sessionVersion: admin.sessionVersion ?? 0 }, env.SESSION_SECRET, {
    subject: admin.email,
    expiresIn: "8h",
    audience: "frame-api",
    issuer: "frame",
    algorithm: "HS256",
  });

const PIN_FAILURE_LIMIT = 5;
const PIN_PAUSE_MS = 30_000;
// shortcut: failed attempts live in this process, share them when more than one API process runs.
const pinAttempts = new Map<string, { failures: number; pausedUntil: number }>();

const router = Router();
router.post(
  "/login",
  attemptLimit("Too many sign-in attempts. Try again in 15 minutes."),
  wrap(async (req, res) => {
    const input = z
      .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
      .parse(req.body);
    const admin = await Admin.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
    if (!admin?.passwordHash || !verifyPassword(input.password, admin.passwordHash))
      throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
    ok(res, { user: publicAdmin(admin), token: signToken(admin) });
  }),
);
router.get(
  "/me",
  requireAuth,
  wrap((req: AuthedRequest, res) => ok(res, { user: publicAdmin(req.user) })),
);
router.post(
  "/lock/verify",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    if (!env.ADMIN_LOCK_PIN)
      throw new HttpError(503, "Screen lock is not configured.", "LOCK_NOT_CONFIGURED");
    const pin = req.body?.pin;
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin))
      throw new HttpError(400, "Enter a 4-digit PIN.", "VALIDATION_ERROR");

    const now = Date.now();
    const attempt = pinAttempts.get(req.user.email) ?? { failures: 0, pausedUntil: 0 };
    if (attempt.pausedUntil > now) {
      const seconds = Math.ceil((attempt.pausedUntil - now) / 1000);
      throw new HttpError(
        429,
        `Too many attempts. Try again in ${seconds} seconds.`,
        "LOCK_PAUSED",
      );
    }
    // Both sides are four ASCII digits, so the buffers always have equal length.
    if (timingSafeEqual(Buffer.from(pin), Buffer.from(env.ADMIN_LOCK_PIN))) {
      pinAttempts.delete(req.user.email);
      return ok(res, { unlocked: true });
    }
    attempt.failures += 1;
    pinAttempts.set(req.user.email, attempt);
    if (attempt.failures < PIN_FAILURE_LIMIT)
      throw new HttpError(401, "Incorrect PIN.", "INVALID_PIN");
    attempt.failures = 0;
    attempt.pausedUntil = now + PIN_PAUSE_MS;
    throw new HttpError(
      429,
      `Too many attempts. Try again in ${PIN_PAUSE_MS / 1000} seconds.`,
      "LOCK_PAUSED",
    );
  }),
);
router.post(
  "/change-password",
  attemptLimit("Too many password attempts. Try again in 15 minutes."),
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z.string().min(12).max(256),
      })
      .parse(req.body);
    const admin = await Admin.findOne({ email: req.user.email }).select("+passwordHash");
    if (!admin?.passwordHash || !verifyPassword(input.currentPassword, admin.passwordHash))
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
