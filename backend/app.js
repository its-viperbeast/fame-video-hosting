import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { ok, HttpError } from "./utils/http.js";
import authRoutes from "./routes/authRoutes.js";
import videoRoutes from "./routes/videoRoutes.js";
export const app = express();
app.disable("x-powered-by");
if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY);
app.use(helmet());
app.use(
  cors({
    origin: new URL(env.FRONTEND_URL).origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Upload-Id", "Authorization"],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.use(
  "/api",
  (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
      },
    },
  }),
);
app.get("/api/health", (_req, res) =>
  ok(res.status(mongoose.connection.readyState === 1 ? 200 : 503), {
    status: mongoose.connection.readyState === 1 ? "healthy" : "unavailable",
  }),
);
app.use("/api/auth", authRoutes);
app.use("/api/videos", videoRoutes);
app.use((_req, _res, next) =>
  next(new HttpError(404, "Endpoint not found.", "NOT_FOUND")),
);
app.use(errorHandler);
