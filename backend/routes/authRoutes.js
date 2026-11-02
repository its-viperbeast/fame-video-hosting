import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import Admin from "../models/Admin.js";
import {
  requireAuth,
  verifyPassword,
  cookieOptions,
} from "../middleware/auth.js";
import { publicAdmin } from "../services/adminService.js";
import { ok, wrap, HttpError } from "../utils/http.js";
const router = Router();
router.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Try again in 15 minutes.",
      },
    },
  }),
  wrap(async (req, res) => {
    const input = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(256),
      })
      .parse(req.body);
    const admin = await Admin.findOne({
      email: input.email.toLowerCase(),
    }).select("+passwordHash");
    if (!admin || !verifyPassword(input.password, admin.passwordHash))
      throw new HttpError(
        401,
        "Email or password is incorrect.",
        "INVALID_CREDENTIALS",
      );
    const token = jwt.sign({ role: admin.role }, env.SESSION_SECRET, {
      subject: admin.email,
      expiresIn: "8h",
      audience: "frame-api",
      issuer: "frame",
      algorithm: "HS256",
    });
    res.cookie("frame_session", token, cookieOptions);
    ok(res, { user: publicAdmin(admin) });
  }),
);
router.get("/me", requireAuth, (req, res) =>
  ok(res, { user: publicAdmin(req.user) }),
);
router.post("/logout", (_req, res) => {
  const { maxAge, ...options } = cookieOptions;
  res.clearCookie("frame_session", options);
  ok(res, { loggedOut: true });
});
export default router;
