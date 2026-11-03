import { app } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { uploadDir } from "./routes/videoRoutes.js";
import { ensureAdmin } from "./services/adminService.js";
import { startCleanupWorker } from "./services/cleanupService.js";
import mongoose from "mongoose";

// PM2's Bun launcher require()s this file. Top-level await would make it an
// async module, which Bun refuses to load that way.
async function main() {
  await connectDB();
  await ensureAdmin();
  const uploads = await mongoose.connection.db
    .listCollections({ name: "uploads" })
    .toArray();
  if (uploads.length) {
    await mongoose.connection.dropCollection("uploads");
    console.info("Removed unused uploads collection");
  }
  await mongoose.connection
    .collection("videos")
    .dropIndex("uploadSession_1")
    .catch((error) => {
      if (![26, 27].includes(error.code)) throw error;
    });
  // Retries interrupted deletions and removes objects from abandoned or failed uploads.
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
        await mongoose.disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
