import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, scryptSync } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import jwt from "jsonwebtoken";

const salt = "1234567890abcdef1234567890abcdef";
// Test files run in parallel; a private TMPDIR keeps upload temp files apart.
process.env.TMPDIR = mkdtempSync(path.join(os.tmpdir(), "frame-cancel-tmp-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/frame-test",
  AWS_REGION: "us-west-004",
  S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
  AWS_S3_BUCKET: "frame-test-bucket",
  AWS_ACCESS_KEY_ID: "test-key",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  FRONTEND_URL: "http://localhost:5173",
  SESSION_SECRET: "s".repeat(40),
  AUTH_EMAIL: "admin@example.com",
  AUTH_PASSWORD_HASH: `${salt}:${scryptSync("correct-test-password", salt, 64).toString("hex")}`,
  // Set, so dotenv does not load a local public media origin; these tests expect signed URLs.
  MEDIA_BASE_URL: "",
});
const { app } = await import("../app.js");
const { installAdmin } = await import("./installAdmin.js");
installAdmin();
const { s3 } = await import("../config/aws.js");
const { default: Video } = await import("../models/Video.js");
const { default: StorageCleanup } = await import("../models/StorageCleanup.js");
const ingests = await import("../services/ingestRegistry.js");
const { ensureUploadDir, uploadDir } = await import("../routes/videoRoutes.js");
ensureUploadDir();

const origin = "http://localhost:5173";
const owner = "admin@example.com";
const auth = `Bearer ${jwt.sign({ role: "admin" }, process.env.SESSION_SECRET, { subject: owner, audience: "frame-api", issuer: "frame", expiresIn: "1h" })}`;
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const scratch = mkdtempSync(path.join(os.tmpdir(), "frame-cancel-test-"));
const clip = path.join(scratch, "clip.mp4");
if (hasFfmpeg)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x480:rate=10",
    "-t",
    "2",
    "-c:v",
    "mpeg4",
    "-y",
    clip,
  ]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function settledTemps(before) {
  for (let i = 0; i < 50; i++) {
    const left = readdirSync(uploadDir).filter((f) => !before.has(f));
    if (!left.length) return left;
    await wait(20);
  }
  return readdirSync(uploadDir).filter((f) => !before.has(f));
}

// A fake bucket and database. `hold` makes a PutObject wait until it is aborted.
function harness(t, { hold, onCreate } = {}) {
  const objects = new Map();
  const records = new Map();
  const journal = new Map();
  const events = [];
  let held;
  const reachedHold = new Promise((resolve) => (held = resolve));
  t.mock.method(s3, "send", async (command, options) => {
    const name = command.constructor.name;
    const key = command.input.Key;
    events.push(`${name}:${key}`);
    if (name === "PutObjectCommand") {
      const body = command.input.Body;
      if (hold?.(key)) {
        held();
        await new Promise((_, reject) =>
          options.abortSignal.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("Request aborted"), {
                  name: "AbortError",
                }),
              ),
            { once: true },
          ),
        );
      }
      if (!Buffer.isBuffer(body)) body.resume();
      objects.set(key, {
        size: command.input.ContentLength,
        type: command.input.ContentType,
      });
      return {};
    }
    if (name === "HeadObjectCommand") {
      const object = objects.get(key);
      if (!object)
        throw Object.assign(new Error("missing"), { name: "NotFound" });
      return { ContentLength: object.size, ContentType: object.type };
    }
    if (name === "ListObjectVersionsCommand")
      return {
        Versions: [...objects.keys()]
          .filter((stored) => stored === command.input.Prefix)
          .map((Key) => ({ Key, VersionId: `version:${Key}` })),
        IsTruncated: false,
      };
    if (name === "DeleteObjectCommand") {
      objects.delete(key);
      return {};
    }
    return {};
  });
  t.mock.method(StorageCleanup, "bulkWrite", async (ops) => {
    for (const op of ops) journal.set(op.updateOne.filter.key, true);
  });
  t.mock.method(StorageCleanup, "deleteOne", async ({ key }) =>
    journal.delete(key),
  );
  t.mock.method(StorageCleanup, "updateOne", async () => ({}));
  const doc = (fields) => ({
    ...fields,
    _id: fields.id,
    toJSON: () => ({ id: fields.id, name: fields.name }),
  });
  t.mock.method(Video, "create", async (fields) => {
    const id = randomUUID().replace(/-/g, "").slice(0, 24);
    records.set(id, { ...fields, id, status: "ready" });
    events.push(`create:${id}`);
    await onCreate?.(id);
    return doc(records.get(id));
  });
  t.mock.method(Video, "exists", async (filter) =>
    [...records.values()].some(
      (r) =>
        r.status === "ready" &&
        filter.$or.some(
          (f) =>
            (f.key && f.key === r.key) ||
            (f.thumbnailKey && f.thumbnailKey === r.thumbnailKey),
        ),
    ),
  );
  t.mock.method(Video, "findOneAndUpdate", (filter, update) => ({
    select: async () => {
      const record = records.get(filter._id);
      if (!record || record.owner !== filter.owner) return null;
      Object.assign(record, update.$set);
      return doc(record);
    },
  }));
  t.mock.method(Video, "deleteOne", async (filter) =>
    records.delete(filter._id),
  );
  return { objects, records, journal, events, reachedHold };
}
const upload = (id) => {
  const req = request(app)
    .post("/api/videos/upload")
    .set("Authorization", auth)
    .set("Origin", origin);
  if (id) req.set("X-Upload-Id", id);
  return req.field("duration", "2").attach("file", clip, "Clip.mp4");
};
const cancel = (id, headers = { Authorization: auth, Origin: origin }) => {
  const req = request(app).post(`/api/videos/upload/${id}/cancel`);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req;
};

test("existing upload directories are made private", () => {
  chmodSync(uploadDir, 0o755);
  ensureUploadDir();
  assert.equal(statSync(uploadDir).mode & 0o777, 0o700);
});

test("the registry rolls back cancels that race with completion", () => {
  const id = randomUUID();
  const first = new AbortController();
  ingests.start(owner, id, first);
  assert.equal(ingests.cancel(owner, id), undefined);
  assert.equal(first.signal.aborted, true);
  assert.equal(ingests.finish(owner, id, first, "video-1"), false);
  // A cancel that arrives first also stops a request that starts later.
  const late = new AbortController();
  ingests.start(owner, id, late);
  assert.equal(late.signal.aborted, true);
  const done = randomUUID();
  const ctrl = new AbortController();
  ingests.start(owner, done, ctrl);
  assert.equal(ingests.finish(owner, done, ctrl, "video-2"), true);
  assert.equal(ingests.cancel("someone@else.example", done), undefined);
  assert.equal(ingests.cancel(owner, done), "video-2");
  const failed = randomUUID();
  const gone = new AbortController();
  ingests.start(owner, failed, gone);
  ingests.settle(owner, failed, gone);
  assert.equal(ingests.cancel(owner, failed), undefined);
});

test(
  "cancelling during processing stops storage work and saves nothing",
  { skip: !hasFfmpeg },
  async (t) => {
    const h = harness(t, { hold: (key) => key.startsWith("videos/") });
    const before = new Set(readdirSync(uploadDir));
    const id = randomUUID();
    const pending = upload(id).then((res) => res);
    await h.reachedHold;
    const cancelled = await cancel(id);
    assert.deepEqual(cancelled.body.data, { cancelled: true, removed: false });
    const res = await pending;
    assert.equal(res.status, 499);
    assert.equal(res.body.error.code, "UPLOAD_CANCELLED");
    assert.ok(!h.events.some((e) => e.startsWith("create:")));
    assert.ok(
      !h.events.some((e) => e.startsWith("PutObjectCommand:thumbnail/")),
    );
    assert.equal(h.objects.size, 0);
    assert.equal(h.journal.size, 0);
    assert.deepEqual(await settledTemps(before), []);
  },
);

test(
  "a cancel that lands while the record is saved rolls the upload back",
  { skip: !hasFfmpeg },
  async (t) => {
    const id = randomUUID();
    const h = harness(t, { onCreate: () => ingests.cancel(owner, id) });
    const res = await upload(id);
    assert.equal(res.status, 499);
    assert.equal(h.records.size, 0);
    assert.equal(h.objects.size, 0);
    assert.equal(h.journal.size, 0);
  },
);

test(
  "a cancel after the server finished removes the video the client never saw",
  { skip: !hasFfmpeg },
  async (t) => {
    const h = harness(t);
    const id = randomUUID();
    const res = await upload(id);
    assert.equal(res.status, 201);
    assert.equal(h.records.size, 1);
    assert.equal(h.objects.size, 2);
    const cancelled = await cancel(id);
    assert.deepEqual(cancelled.body.data, { cancelled: true, removed: true });
    assert.equal(h.records.size, 0);
    assert.equal(h.objects.size, 0);
  },
);

test(
  "completed uploads without a cancel are preserved",
  { skip: !hasFfmpeg },
  async (t) => {
    const h = harness(t);
    const res = await upload(randomUUID());
    assert.equal(res.status, 201);
    const other = await cancel(randomUUID());
    assert.deepEqual(other.body.data, { cancelled: true, removed: false });
    assert.equal(h.records.size, 1);
    assert.equal(h.objects.size, 2);
  },
);

test(
  "cancelling during the transfer closes the request and removes the partial file",
  { skip: !hasFfmpeg },
  async (t) => {
    const h = harness(t);
    const server = app.listen(0);
    let req;
    t.after(() => {
      req?.destroy();
      server.closeAllConnections();
      server.close();
    });
    await new Promise((resolve) => server.once("listening", resolve));
    const before = new Set(readdirSync(uploadDir));
    const id = randomUUID();
    const boundary = `----cancel${randomUUID()}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
    );
    const data = readFileSync(clip);
    const closed = new Promise((resolve) => {
      req = http.request({
        port: server.address().port,
        path: "/api/videos/upload",
        method: "POST",
        headers: {
          Authorization: auth,
          Origin: origin,
          "X-Upload-Id": id,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": head.length + data.length * 4,
        },
      });
      req.on("error", () => resolve("closed"));
      req.on("response", (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.write(head);
      req.write(data);
    });
    await wait(200);
    assert.equal(
      readdirSync(uploadDir).filter((f) => !before.has(f)).length,
      1,
    );
    await cancel(id);
    assert.ok(["closed", 499].includes(await closed));
    assert.deepEqual(await settledTemps(before), []);
    assert.equal(h.events.length, 0);
  },
);

test("upload and cancel IDs are validated, and cancels require a session", async () => {
  const bad = await request(app)
    .post("/api/videos/upload")
    .set("Authorization", auth)
    .set("Origin", origin)
    .set("X-Upload-Id", "../../etc");
  assert.equal(bad.status, 400);
  assert.equal((await cancel("not-a-uuid")).status, 400);
  assert.equal((await cancel(randomUUID(), { Origin: origin })).status, 401);
  assert.equal(
    (await cancel(randomUUID(), { Authorization: auth })).status,
    200,
  );
});
