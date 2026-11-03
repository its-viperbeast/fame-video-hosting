// Opt-in integration check. Creates and removes only its own UUID-named fixtures.
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";

let server, cleanup, Video, fixtureId;
const keys = [];
try {
  const { env } = await import("../config/env.js");
  const { app } = await import("../app.js");
  const { s3 } = await import("../config/aws.js");
  ({ default: Video } = await import("../models/Video.js"));
  const storage = await import("../services/s3Service.js");
  cleanup = await import("../services/cleanupService.js");
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const { ensureAdmin } = await import("../services/adminService.js");
  await ensureAdmin();
  const key = `videos/${randomUUID()}.mp4`;
  const thumbnailKey = `thumbnail/${randomUUID()}.webp`;
  const versions = async (Key) => {
    const result = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: env.AWS_S3_BUCKET,
        Prefix: Key,
      }),
    );
    assert.equal(
      result.IsTruncated,
      false,
      "Unexpected pagination for this new test key",
    );
    return [...(result.Versions || []), ...(result.DeleteMarkers || [])].filter(
      (entry) => entry.Key === Key,
    );
  };
  // Confirm version-list access before creating anything in the bucket.
  assert.equal((await versions(key)).length, 0);
  keys.push(key, thumbnailKey);
  await cleanup.track(keys, env.AUTH_EMAIL);
  const source = fileURLToPath(
    new URL("../../frontend/public/sample.mp4", import.meta.url),
  );
  const { size } = await stat(source);
  // Include an overwritten version and an old-style hide marker in the fixture.
  await storage.putFile(key, source, size);
  await storage.putFile(key, source, size);
  await s3.send(
    new DeleteObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }),
  );
  assert.ok(
    (await versions(key)).length >= 3,
    "Expected retained versions and a hide marker",
  );
  console.info(
    "Confirmed: name-only deletion retains file versions in the real bucket.",
  );
  const image = await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: "#000000",
    },
  })
    .webp()
    .toBuffer();
  await storage.putThumbnail(thumbnailKey, image);
  fixtureId = new mongoose.Types.ObjectId();
  const video = await Video.create({
    _id: fixtureId,
    owner: env.AUTH_EMAIL,
    name: "Delete-flow verification.mp4",
    key,
    thumbnailKey,
    size,
  });
  assert.equal(
    (await Video.collection.findOne({ _id: fixtureId })).__v,
    undefined,
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const token = jwt.sign({ role: "admin" }, env.SESSION_SECRET, {
    subject: env.AUTH_EMAIL,
    audience: "frame-api",
    issuer: "frame",
    expiresIn: "1m",
  });
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/videos/${video.id}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60000),
    },
  );
  const body = await response.json();
  assert.equal(
    response.status,
    200,
    `Delete endpoint failed: ${body.error?.code || response.status}`,
  );
  assert.equal(body.data.deleted, true);
  for (const Key of keys) {
    assert.equal(
      (await versions(Key)).length,
      0,
      "A stored version or delete marker remains",
    );
    await assert.rejects(
      s3.send(new HeadObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key })),
      (error) => error.$metadata?.httpStatusCode === 404,
    );
  }
  assert.equal(await Video.exists({ _id: fixtureId }), null);
  console.info(
    "PASS: delete endpoint removed every video/thumbnail version and marker, both objects return 404, and the MongoDB record is gone.",
  );
} catch (error) {
  console.error(
    `Live delete check failed (${error.name}, ${error.code || "no code"}).`,
  );
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1 && cleanup) {
    try {
      if (fixtureId) {
        const remaining = await Video.findOneAndUpdate(
          { _id: fixtureId },
          { $set: { status: "deleting" } },
          { new: true },
        ).select("+key +thumbnailKey");
        if (remaining) await cleanup.destroyVideo(remaining);
      }
      const failed = await cleanup.reconcile(keys);
      if (failed.length) throw new Error("Fixture cleanup incomplete");
      console.info("Verification fixture cleanup complete.");
    } catch (error) {
      console.error(
        `Fixture cleanup pending (${error.name}); the cleanup worker will retry.`,
      );
      process.exitCode = 1;
    }
  }
  await mongoose.disconnect();
}
