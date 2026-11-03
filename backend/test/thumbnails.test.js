import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { scryptSync } from "node:crypto";
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import jwt from "jsonwebtoken";
import sharp from "sharp";

const salt = "1234567890abcdef1234567890abcdef";
Object.assign(process.env, {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/frame-test",
  AWS_REGION: "us-west-004",
  S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
  AWS_S3_BUCKET: "frame-test-bucket",
  AWS_ACCESS_KEY_ID: "test-key",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  FRONTEND_URL: "http://localhost:5173",
  APP_BASE_URL: "http://localhost:9090",
  SESSION_SECRET: "s".repeat(40),
  AUTH_EMAIL: "admin@example.com",
  AUTH_PASSWORD_HASH: `${salt}:${scryptSync("correct-test-password", salt, 64).toString("hex")}`,
  // Set, so dotenv does not load a local public media origin; these tests expect signed URLs.
  MEDIA_BASE_URL: "",
});
const { app } = await import("../app.js");
const { s3 } = await import("../config/aws.js");
const { default: Video } = await import("../models/Video.js");
const { installAdmin } = await import("./installAdmin.js");
installAdmin();
const { default: StorageCleanup } = await import("../models/StorageCleanup.js");
const { processThumbnailImage, videoThumbnail } =
  await import("../services/thumbnailService.js");
const { deleteObject, thumbnailUrl } = await import("../services/s3Service.js");
const { sweep } = await import("../services/cleanupService.js");
const { uploadDir } = await import("../routes/videoRoutes.js");

const origin = "http://localhost:5173";
const owner = "admin@example.com";
const id = "012345678901234567890123";
const cookie = `frame_session=${jwt.sign({ role: "admin" }, process.env.SESSION_SECRET, { subject: owner, audience: "frame-api", issuer: "frame", expiresIn: "1h" })}`;
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const scratch = mkdtempSync(path.join(os.tmpdir(), "frame-thumb-test-"));
function testVideo(name = "clip.mp4", size = "640x480") {
  const file = path.join(scratch, name);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=${size}:rate=10`,
    "-t",
    "2",
    "-c:v",
    "mpeg4",
    "-pix_fmt",
    "yuv420p",
    "-y",
    file,
  ]);
  return file;
}
const solid = (width, height, color, format = "png") =>
  sharp({ create: { width, height, channels: 3, background: color } })
    .toFormat(format)
    .toBuffer();
async function pixel(buffer, x, y) {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}
const near = (actual, expected) =>
  assert.ok(
    actual.every((v, i) => Math.abs(v - expected[i]) < 24),
    `${actual} is not close to ${expected}`,
  );
const doc = (fields) => ({
  _id: id,
  id,
  owner,
  status: "ready",
  ...fields,
  toJSON() {
    return { id, name: "Clip.mp4", favorite: false };
  },
});
const query = (value) => ({ select: async () => value });
// A small in-memory bucket and cleanup journal, so tests can assert what remains.
function fakeStorage(t, { failPut, failDelete } = {}) {
  const objects = new Map();
  const calls = [];
  t.mock.method(s3, "send", async (command) => {
    const name = command.constructor.name;
    const key = command.input.Key ?? command.input.Prefix;
    calls.push([name, key]);
    if (name === "PutObjectCommand") {
      if (failPut?.(key))
        throw Object.assign(new Error("down"), { name: "ServiceUnavailable" });
      const body = command.input.Body;
      objects.set(key, {
        body: Buffer.isBuffer(body) ? body : null,
        size: command.input.ContentLength,
        type: command.input.ContentType,
      });
      if (!Buffer.isBuffer(body)) body.resume?.();
      return {};
    }
    if (name === "HeadObjectCommand") {
      const object = objects.get(key);
      if (!object)
        throw Object.assign(new Error("missing"), { name: "NotFound" });
      return { ContentLength: object.size, ContentType: object.type };
    }
    if (name === "ListObjectVersionsCommand") {
      return {
        Versions: [...objects.keys()]
          .filter((stored) => stored.startsWith(key))
          .map((Key) => ({ Key, VersionId: `version:${Key}` })),
        IsTruncated: false,
      };
    }
    if (name === "DeleteObjectCommand") {
      assert.equal(command.input.VersionId, `version:${key}`);
      if (failDelete?.(key))
        throw Object.assign(new Error("down"), { name: "InternalError" });
      if (!objects.delete(key))
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      return {};
    }
    return {};
  });
  const journal = new Map();
  t.mock.method(StorageCleanup, "bulkWrite", async (ops) => {
    for (const op of ops)
      journal.set(op.updateOne.filter.key, op.updateOne.update.$set);
    calls.push(["track", ops.map((op) => op.updateOne.filter.key)]);
  });
  t.mock.method(StorageCleanup, "deleteOne", async ({ key }) =>
    journal.delete(key),
  );
  t.mock.method(StorageCleanup, "updateOne", async () => ({}));
  return { objects, calls, journal };
}

test("custom images become 1920x1080 WebP without stretching", async () => {
  const wide = await processThumbnailImage(await solid(800, 200, "#ff0000"));
  const meta = await sharp(wide).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 1920);
  assert.equal(meta.height, 1080);
  // A 4:1 image fills 1920x480 in the middle, with letterbox bars above and below.
  near(await pixel(wide, 960, 540), [255, 0, 0]);
  near(await pixel(wide, 960, 320), [255, 0, 0]);
  near(await pixel(wide, 960, 280), [0, 0, 0]);
  const tall = await processThumbnailImage(
    await solid(300, 600, "#0000ff", "jpeg"),
  );
  near(await pixel(tall, 960, 540), [0, 0, 255]);
  near(await pixel(tall, 660, 540), [0, 0, 0]);
});

test("custom thumbnails are validated by their decoded content", async () => {
  await assert.rejects(processThumbnailImage(Buffer.from("not an image")), {
    status: 415,
  });
  await assert.rejects(
    processThumbnailImage(await solid(400, 400, "#fff", "gif")),
    { status: 415 },
  );
  await assert.rejects(
    processThumbnailImage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"/>',
      ),
    ),
    { status: 415 },
  );
  await assert.rejects(processThumbnailImage(await solid(320, 120, "#fff")), {
    status: 422,
  });
});

test(
  "video thumbnails are 1080p WebP frames, even when the seek point is past the end",
  { skip: !hasFfmpeg },
  async () => {
    const file = testVideo();
    for (const duration of [2, 9999, 0]) {
      const meta = await sharp(await videoThumbnail(file, duration)).metadata();
      assert.deepEqual(
        [meta.format, meta.width, meta.height],
        ["webp", 1920, 1080],
      );
    }
    assert.deepEqual(
      readdirSync(scratch).filter((f) => f.endsWith(".png")),
      [],
    );
  },
);

test("thumbnail URLs are private signed GETs that stay stable for caching", async () => {
  const first = new URL(await thumbnailUrl("thumbnail/a.webp"));
  assert.equal(first.pathname, "/frame-test-bucket/thumbnail/a.webp");
  assert.match(first.searchParams.get("X-Amz-Signature"), /^[a-f0-9]{64}$/);
  assert.equal(first.searchParams.get("response-content-type"), "image/webp");
  assert.equal(first.href, await thumbnailUrl("thumbnail/a.webp"));
  assert.notEqual(first.href, await thumbnailUrl("thumbnail/b.webp"));
});

test("permanent deletion lists every page, deletes exact versions before markers, and verifies absence", async (t) => {
  const key = "videos/clip.mp4";
  const deleted = [];
  let listings = 0;
  t.mock.method(s3, "send", async (command) => {
    assert.equal(command.input.Bucket, "frame-test-bucket");
    if (command.constructor.name === "ListObjectVersionsCommand") {
      assert.equal(command.input.Prefix, key);
      listings++;
      if (listings === 1)
        return {
          Versions: [
            { Key: key, VersionId: "latest" },
            { Key: `${key}.other`, VersionId: "unrelated" },
          ],
          DeleteMarkers: [{ Key: key, VersionId: "hide" }],
          IsTruncated: true,
          NextKeyMarker: key,
          NextVersionIdMarker: "latest",
        };
      if (listings === 2) {
        assert.equal(command.input.KeyMarker, key);
        assert.equal(command.input.VersionIdMarker, "latest");
        return {
          Versions: [{ Key: key, VersionId: "older" }],
          IsTruncated: false,
        };
      }
      assert.deepEqual(deleted, ["latest", "older", "hide"]);
      return { Versions: [], DeleteMarkers: [], IsTruncated: false };
    }
    assert.equal(command.constructor.name, "DeleteObjectCommand");
    assert.equal(command.input.Key, key);
    assert.ok(command.input.VersionId);
    deleted.push(command.input.VersionId);
    return {};
  });
  await deleteObject(key);
  assert.equal(listings, 3);
});

test("already-gone keys and concurrently removed versions are safe to retry", async (t) => {
  let exists = false,
    deletes = 0;
  t.mock.method(s3, "send", async (command) => {
    if (command.constructor.name === "ListObjectVersionsCommand")
      return {
        Versions: exists ? [{ Key: "videos/gone.mp4", VersionId: "gone" }] : [],
      };
    deletes++;
    exists = false;
    throw Object.assign(new Error("gone"), { name: "NoSuchVersion" });
  });
  await deleteObject("videos/gone.mp4");
  assert.equal(deletes, 0);
  exists = true;
  await deleteObject("videos/gone.mp4");
  assert.equal(deletes, 1);
  await deleteObject("videos/gone.mp4");
  assert.equal(deletes, 1);
});

test("listing permission failures and missing buckets are not mistaken for a deleted file", async (t) => {
  let error;
  t.mock.method(s3, "send", async () => {
    throw error;
  });
  for (const name of ["AccessDenied", "NoSuchBucket", "InternalError"]) {
    error = Object.assign(new Error(name), { name });
    await assert.rejects(deleteObject("videos/clip.mp4"), { name });
  }
});

test("successful delete responses are insufficient if storage still lists a version", async (t) => {
  t.mock.method(s3, "send", async (command) =>
    command.constructor.name === "ListObjectVersionsCommand"
      ? { Versions: [{ Key: "videos/clip.mp4", VersionId: "still-there" }] }
      : {},
  );
  await assert.rejects(deleteObject("videos/clip.mp4"), {
    code: "DELETE_INCOMPLETE",
  });
});

test("a denied file-version deletion keeps its hide marker for retry", async (t) => {
  const deletions = [];
  t.mock.method(s3, "send", async (command) => {
    if (command.constructor.name === "ListObjectVersionsCommand")
      return {
        Versions: [{ Key: "videos/clip.mp4", VersionId: "locked" }],
        DeleteMarkers: [{ Key: "videos/clip.mp4", VersionId: "hide" }],
      };
    deletions.push(command.input.VersionId);
    throw Object.assign(new Error("locked"), { name: "AccessDenied" });
  });
  await assert.rejects(deleteObject("videos/clip.mp4"), {
    name: "AccessDenied",
  });
  assert.deepEqual(deletions, ["locked"]);
});

test("invalid storage version listings fail safely without a name-only delete", async (t) => {
  let response;
  t.mock.method(s3, "send", async (command) => {
    assert.equal(command.constructor.name, "ListObjectVersionsCommand");
    return response;
  });
  for (response of [
    { Versions: [{ Key: "videos/clip.mp4" }] },
    { IsTruncated: true },
    {
      IsTruncated: true,
      NextKeyMarker: "videos/clip.mp4",
      NextVersionIdMarker: "stuck",
    },
  ])
    await assert.rejects(deleteObject("videos/clip.mp4"), {
      code: "STORAGE_MISMATCH",
    });
});

function replaceHarness(t, options) {
  const storage = fakeStorage(t, options);
  storage.objects.set("thumbnail/old.webp", { size: 10, type: "image/webp" });
  const state = { thumbnailKey: "thumbnail/old.webp" };
  let ownerFilter;
  t.mock.method(Video, "findOne", (filter) => {
    ownerFilter = filter;
    return query(filter._id === id ? doc({ ...state }) : null);
  });
  t.mock.method(Video, "exists", async (filter) =>
    filter.$or.some((f) => f.thumbnailKey === state.thumbnailKey)
      ? { _id: id }
      : null,
  );
  t.mock.method(Video, "findOneAndUpdate", (filter, update) => {
    storage.calls.push(["swap", update.$set.thumbnailKey]);
    if (options?.conflict || filter.thumbnailKey !== state.thumbnailKey)
      return query(null);
    state.thumbnailKey = update.$set.thumbnailKey;
    return query(doc({ ...state }));
  });
  const send = (image, name = "cover.png", type = "image/png") =>
    request(app)
      .put(`/api/videos/${id}/thumbnail`)
      .set("Cookie", cookie)
      .set("Origin", origin)
      .attach("thumbnail", image, { filename: name, contentType: type });
  return { ...storage, state, send, ownerFilter: () => ownerFilter };
}

test("replacing a thumbnail confirms the upload and database swap before deleting the old one", async (t) => {
  const h = replaceHarness(t);
  const res = await h.send(await solid(800, 800, "#00ff00"));
  assert.equal(res.status, 200);
  assert.equal(h.ownerFilter().owner, owner);
  const next = h.state.thumbnailKey;
  assert.match(next, /^thumbnail\/[0-9a-f-]{36}\.webp$/);
  assert.match(
    res.body.data.video.thumbnailUrl,
    new RegExp(next.replace(".", "\\.")),
  );
  const order = h.calls.map(([name, key]) => `${name}:${key}`);
  assert.deepEqual(order, [
    `track:${next},thumbnail/old.webp`,
    `PutObjectCommand:${next}`,
    `HeadObjectCommand:${next}`,
    `swap:${next}`,
    `ListObjectVersionsCommand:thumbnail/old.webp`,
    `DeleteObjectCommand:thumbnail/old.webp`,
    `ListObjectVersionsCommand:thumbnail/old.webp`,
  ]);
  assert.deepEqual([...h.objects.keys()], [next]);
  const stored = await sharp(h.objects.get(next).body).metadata();
  assert.deepEqual(
    [stored.format, stored.width, stored.height],
    ["webp", 1920, 1080],
  );
  assert.equal(h.journal.size, 0);
});

test("a failed replacement keeps the existing thumbnail and removes the new upload", async (t) => {
  const h = replaceHarness(t, {
    failPut: (key) => key !== "thumbnail/old.webp",
  });
  const res = await h.send(await solid(800, 800, "#00ff00"));
  assert.equal(res.status, 502);
  assert.match(res.body.error.message, /current thumbnail was kept/);
  assert.equal(h.state.thumbnailKey, "thumbnail/old.webp");
  assert.deepEqual([...h.objects.keys()], ["thumbnail/old.webp"]);
  assert.ok(!h.calls.some(([name]) => name === "swap"));
  assert.ok(
    !h.calls.some(
      ([name, key]) =>
        name === "DeleteObjectCommand" && key === "thumbnail/old.webp",
    ),
  );
  assert.equal(h.journal.size, 0);
});

test("a replacement that loses the database swap deletes its own upload", async (t) => {
  const h = replaceHarness(t, { conflict: true });
  const res = await h.send(await solid(800, 800, "#00ff00"));
  assert.equal(res.status, 409);
  assert.equal(h.state.thumbnailKey, "thumbnail/old.webp");
  assert.deepEqual([...h.objects.keys()], ["thumbnail/old.webp"]);
});

test("invalid or unowned replacements are rejected before anything is stored", async (t) => {
  const h = replaceHarness(t);
  const fake = await h.send(Buffer.from("plain text, not pixels"), "cover.png");
  assert.equal(fake.status, 415);
  const svg = await h.send(Buffer.from("<svg/>"), "cover.svg", "image/svg+xml");
  assert.equal(svg.status, 415);
  const missing = await request(app)
    .put("/api/videos/111111111111111111111111/thumbnail")
    .set("Cookie", cookie)
    .set("Origin", origin)
    .attach("thumbnail", await solid(800, 800, "#000"), "cover.png");
  assert.equal(missing.status, 404);
  const anonymous = await request(app)
    .put(`/api/videos/${id}/thumbnail`)
    .set("Origin", origin)
    .attach("thumbnail", await solid(800, 800, "#000"), "cover.png");
  assert.equal(anonymous.status, 401);
  assert.deepEqual(h.calls, []);
});

function deleteHarness(t, options) {
  const storage = fakeStorage(t, options);
  storage.objects.set("videos/v.mp4", { size: 1 });
  storage.objects.set("thumbnail/t.webp", { size: 1 });
  const record = { exists: true, status: "ready" };
  let filter;
  t.mock.method(Video, "findOneAndUpdate", (f, update) => {
    filter = f;
    if (f._id !== id || !record.exists) return query(null);
    record.status = update.$set.status;
    return query(
      doc({
        key: "videos/v.mp4",
        thumbnailKey: "thumbnail/t.webp",
        status: record.status,
      }),
    );
  });
  t.mock.method(Video, "deleteOne", async (f) => {
    assert.equal(f.status, "deleting");
    assert.equal(
      storage.objects.size,
      0,
      "MongoDB record must outlive all stored objects",
    );
    record.exists = false;
  });
  const send = () =>
    request(app)
      .delete(`/api/videos/${id}`)
      .set("Cookie", cookie)
      .set("Origin", origin);
  return { ...storage, record, send, filter: () => filter };
}

test("deleting a video removes its video and thumbnail objects, then the record", async (t) => {
  const h = deleteHarness(t);
  const res = await h.send();
  assert.equal(res.status, 200);
  assert.equal(h.filter().owner, owner);
  assert.equal(h.objects.size, 0);
  assert.equal(h.record.exists, false);
});

test("already-missing objects do not block deletion", async (t) => {
  const h = deleteHarness(t);
  h.objects.delete("thumbnail/t.webp");
  assert.equal((await h.send()).status, 200);
  assert.equal(h.record.exists, false);
});

test("a partial deletion failure keeps the record for a safe retry", async (t) => {
  let down = true;
  const h = deleteHarness(t, {
    failDelete: (key) => down && key === "thumbnail/t.webp",
  });
  const first = await h.send();
  assert.equal(first.status, 503);
  assert.equal(first.body.error.code, "DELETE_INCOMPLETE");
  assert.deepEqual([...h.objects.keys()], ["thumbnail/t.webp"]);
  assert.deepEqual([h.record.exists, h.record.status], [true, "deleting"]);
  down = false;
  assert.equal((await h.send()).status, 200);
  assert.equal(h.objects.size, 0);
  assert.equal(h.record.exists, false);
});

test("deleting another owner's or a missing video is a 404", async (t) => {
  const h = deleteHarness(t);
  h.record.exists = false;
  assert.equal((await h.send()).status, 404);
  assert.equal(h.objects.size, 2);
});

function ingestHarness(t, options = {}) {
  const storage = fakeStorage(t, options);
  const created = [];
  t.mock.method(Video, "create", async (fields) => {
    if (options.failCreate) throw new Error("database unavailable");
    created.push(fields);
    return doc(fields);
  });
  t.mock.method(Video, "exists", async (filter) =>
    created.some((v) =>
      filter.$or.some(
        (f) =>
          (f.key && f.key === v.key) ||
          (f.thumbnailKey && f.thumbnailKey === v.thumbnailKey),
      ),
    )
      ? { _id: id }
      : null,
  );
  const send = (file) =>
    request(app)
      .post("/api/videos/upload")
      .set("Cookie", cookie)
      .set("Origin", origin)
      .field("duration", "2")
      .attach("file", file, "Clip.mp4");
  return { ...storage, created, send };
}
const uploadTemps = () => new Set(readdirSync(uploadDir));
// Temp files are removed in a finally block that runs just after the response is sent.
async function newTemps(before) {
  for (let i = 0; i < 50; i++) {
    const left = [...uploadTemps()].filter((f) => !before.has(f));
    if (!left.length) return left;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return [...uploadTemps()].filter((f) => !before.has(f));
}

test(
  "uploads store the video and a generated 1080p WebP thumbnail with both keys",
  { skip: !hasFfmpeg },
  async (t) => {
    const h = ingestHarness(t);
    const before = uploadTemps();
    const res = await h.send(testVideo());
    assert.equal(res.status, 201);
    const [video] = h.created;
    assert.match(video.key, /^videos\/[0-9a-f-]{36}\.mp4$/);
    assert.match(video.thumbnailKey, /^thumbnail\/[0-9a-f-]{36}\.webp$/);
    assert.match(res.body.data.video.thumbnailUrl, /X-Amz-Signature/);
    assert.equal(res.body.data.warning, undefined);
    // Keys are journaled before any object is written.
    assert.equal(h.calls[0][0], "track");
    assert.deepEqual(
      h.calls[0][1].sort(),
      [video.key, video.thumbnailKey].sort(),
    );
    const meta = await sharp(h.objects.get(video.thumbnailKey).body).metadata();
    assert.deepEqual(
      [meta.format, meta.width, meta.height],
      ["webp", 1920, 1080],
    );
    // B2 treats PutObjectTagging as PutObject and would replace the video with tag XML.
    assert.ok(!h.calls.some(([name]) => name === "PutObjectTaggingCommand"));
    assert.equal(h.objects.get(video.key).size, video.size);
    assert.equal(h.journal.size, 0);
    assert.deepEqual(await newTemps(before), []);
  },
);

test(
  "a failed database write removes both uploaded objects",
  { skip: !hasFfmpeg },
  async (t) => {
    const h = ingestHarness(t, { failCreate: true });
    const res = await h.send(testVideo());
    assert.equal(res.status, 500);
    assert.equal(h.objects.size, 0);
    assert.equal(h.journal.size, 0);
  },
);

test(
  "a thumbnail storage failure keeps the video and reports a warning",
  { skip: !hasFfmpeg },
  async (t) => {
    const h = ingestHarness(t, {
      failPut: (key) => key.startsWith("thumbnail/"),
    });
    const res = await h.send(testVideo());
    assert.equal(res.status, 201);
    assert.match(res.body.data.warning, /thumbnail could not be created/);
    assert.equal(h.created[0].thumbnailKey, undefined);
    assert.deepEqual([...h.objects.keys()], [h.created[0].key]);
    assert.equal(h.journal.size, 0);
  },
);

test("the cleanup worker finishes stuck deletions and removes unreferenced objects", async (t) => {
  const storage = fakeStorage(t);
  for (const key of [
    "videos/stuck.mp4",
    "thumbnail/stuck.webp",
    "videos/orphan.mp4",
    "thumbnail/live.webp",
  ])
    storage.objects.set(key, { size: 1 });
  t.mock.method(Video, "find", () => ({
    select: () => ({
      limit: async () => [
        doc({
          key: "videos/stuck.mp4",
          thumbnailKey: "thumbnail/stuck.webp",
          status: "deleting",
        }),
      ],
    }),
  }));
  const removed = [];
  t.mock.method(Video, "deleteOne", async (f) => removed.push(f._id));
  const due = ["videos/orphan.mp4", "thumbnail/live.webp"];
  t.mock.method(StorageCleanup, "findOneAndUpdate", async () => {
    const key = due.shift();
    return key ? { key } : null;
  });
  t.mock.method(Video, "exists", async (filter) =>
    filter.$or.some((f) => f.thumbnailKey === "thumbnail/live.webp")
      ? { _id: id }
      : null,
  );
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "frame-sweep-test-"));
  writeFileSync(path.join(tempDir, "old.mp4"), "x");
  writeFileSync(path.join(tempDir, "new.mp4"), "x");
  const old = new Date(Date.now() - 2 * 86400000);
  utimesSync(path.join(tempDir, "old.mp4"), old, old);
  await sweep({ tempDir });
  assert.deepEqual(removed, [id]);
  assert.deepEqual([...storage.objects.keys()], ["thumbnail/live.webp"]);
  assert.deepEqual(readdirSync(tempDir), ["new.mp4"]);
});
