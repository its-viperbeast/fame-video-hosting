import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import Video from "../models/Video.js";
import StorageCleanup from "../models/StorageCleanup.js";
import * as storage from "./s3Service.js";

// Objects being uploaded are left alone this long, even after a crash.
const IN_FLIGHT_MS = 24 * 3600000;
const RETRY_MS = 5 * 60000;
// A request that is still deleting must not race with the worker.
const STUCK_DELETE_MS = 10 * 60000;
const TEMP_FILE_MS = 24 * 3600000;

const log = (scope, error) =>
  console.error({ cleanup: scope, code: error.name, message: error.message });

// Keys are recorded before any write, so a crash, abandoned request, or failed
// database update cannot leave an object that nothing knows about.
export async function track(keys, owner, delay = IN_FLIGHT_MS) {
  if (!keys.length) return;
  const deleteAfter = new Date(Date.now() + delay);
  await StorageCleanup.bulkWrite(
    keys.map((key) => ({
      updateOne: { filter: { key }, update: { $set: { owner, deleteAfter } }, upsert: true },
    })),
  );
}

// Deletes each tracked object that no ready video references, then stops
// tracking it. Referenced objects are only untracked. Failures stay tracked and
// the worker retries them. Returns the keys that could not be settled.
export async function reconcile(keys) {
  const failed = [];
  for (const key of keys) {
    try {
      if (!(await Video.exists({ status: "ready", $or: [{ key }, { thumbnailKey: key }] })))
        await storage.deleteObject(key);
      await StorageCleanup.deleteOne({ key });
    } catch (error) {
      failed.push(key);
      log(key, error);
      await StorageCleanup.updateOne(
        { key },
        { $set: { deleteAfter: new Date(Date.now() + RETRY_MS) }, $inc: { attempts: 1 } },
      ).catch(() => {});
    }
  }
  return failed;
}

// The record must already be marked deleting. Both objects are attempted, and
// the record is removed only once neither remains, so a retry finishes the job.
export async function destroyVideo(video) {
  const results = await Promise.allSettled(
    [video.key, video.thumbnailKey].filter(Boolean).map((key) => storage.deleteObject(key)),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  await Video.deleteOne({ _id: video._id, owner: video.owner, status: "deleting" });
}

export async function sweep({ tempDir, now = Date.now() } = {}) {
  const stuck = await Video.find({
    status: "deleting",
    updatedAt: { $lt: new Date(now - STUCK_DELETE_MS) },
  })
    .select("+key +thumbnailKey")
    .limit(100);
  for (const video of stuck) await destroyVideo(video).catch((error) => log(video.id, error));
  for (let i = 0; i < 100; i++) {
    // Claiming pushes deleteAfter forward, so parallel workers skip this entry.
    const entry = await StorageCleanup.findOneAndUpdate(
      { deleteAfter: { $lte: new Date(now) } },
      { $set: { deleteAfter: new Date(now + RETRY_MS) } },
      { sort: { deleteAfter: 1 } },
    );
    if (!entry) break;
    await reconcile([entry.key]);
  }
  if (!tempDir) return;
  for (const name of await readdir(tempDir).catch(() => [])) {
    const file = path.join(tempDir, name);
    const info = await stat(file).catch(() => null);
    if (info?.isFile() && now - info.mtimeMs > TEMP_FILE_MS)
      await rm(file, { force: true }).catch(() => {});
  }
}

export function startCleanupWorker(options, intervalMs = 5 * 60000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweep(options);
    } catch (error) {
      log("sweep", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
