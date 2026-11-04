import { app } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { ensureUploadDir, uploadDir } from "./routes/videoRoutes.js";
import { ensureAdmin } from "./services/adminService.js";
import { startCleanupWorker } from "./services/cleanupService.js";
import mongoose from "mongoose";

// PM2's Bun launcher require()s this file. Top-level await would make it an
// async module, which Bun refuses to load that way.
async function main() {
  await connectDB();
  await ensureAdmin();
  // Retries interrupted deletions and removes objects from abandoned or failed uploads.
  ensureUploadDir();
  const stopCleanup = startCleanupWorker({ tempDir: uploadDir });
  const server = app.listen(env.PORT, () =>
    console.info(`Frame API listening on http://localhost:${env.PORT}`),
  );
  // Uploads include the file body, the faststart remux, and the bucket transfer.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.timeout = 0;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stopCleanup();
      server.close(async () => {
        try {
          await mongoose.disconnect();
          process.exit(0);
        } catch (error) {
          console.error(error);
          process.exit(1);
        }
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
