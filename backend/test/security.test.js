import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import request from "supertest";
import jwt from "jsonwebtoken";

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
  APP_BASE_URL: "http://localhost:5000",
  SESSION_SECRET: "s".repeat(40),
  AUTH_EMAIL: "admin@example.com",
  AUTH_PASSWORD_HASH: `${salt}:${scryptSync("correct-test-password", salt, 64).toString("hex")}`,
  // Set, so dotenv does not load a local public media origin; these tests expect signed URLs.
  MEDIA_BASE_URL: "",
});
const { app } = await import("../app.js");
const { fileSchema, validateMp4Header, escapeRegex } =
  await import("../utils/validation.js");
const { s3 } = await import("../config/aws.js");
const { verifyObject, createUpload, playbackUrl } =
  await import("../services/s3Service.js");
const { default: Video } = await import("../models/Video.js");
const { default: Admin } = await import("../models/Admin.js");
const { default: StorageCleanup } = await import("../models/StorageCleanup.js");
const { installAdmin } = await import("./installAdmin.js");
installAdmin();
const origin = "http://localhost:5173";
function cookie(payload = { role: "admin" }, options = {}) {
  return `frame_session=${jwt.sign(payload, process.env.SESSION_SECRET, { subject: "admin@example.com", audience: "frame-api", issuer: "frame", expiresIn: "1h", ...options })}`;
}
function mp4() {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(24, 0);
  b.write("ftyp", 4);
  b.write("isom", 8);
  b.write("mp42", 16);
  return b;
}

test("all management endpoints reject anonymous requests", async () => {
  for (const [method, path] of [
    ["get", "/api/videos"],
    ["get", "/api/videos/012345678901234567890123/play"],
    ["post", "/api/videos/upload"],
    ["delete", "/api/videos/012345678901234567890123"],
    ["patch", "/api/videos/012345678901234567890123"],
  ]) {
    const res = await request(app)[method](path).set("Origin", origin);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "UNAUTHORIZED");
  }
});
test("login issues an HttpOnly session, rejects bad credentials, and supports logout", async () => {
  const agent = request.agent(app);
  const bad = await agent
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email: "admin@example.com", password: "incorrect" });
  assert.equal(bad.status, 401);
  const login = await agent
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email: "admin@example.com", password: "correct-test-password" });
  assert.equal(login.status, 200);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
  assert.match(login.headers["set-cookie"][0], /SameSite=Lax/);
  assert.equal((await agent.get("/api/auth/me")).status, 200);
  assert.equal(
    (await agent.post("/api/auth/logout").set("Origin", origin)).status,
    200,
  );
  assert.equal((await agent.get("/api/auth/me")).status, 401);
});
test("cross-origin and missing-origin mutations are blocked", async () => {
  for (const value of [undefined, "https://attacker.example"]) {
    let req = request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie())
      .send({});
    if (value) req = req.set("Origin", value);
    const result = await req;
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "INVALID_ORIGIN");
  }
});
test("wrong role, owner, audience, and expired sessions are rejected", async () => {
  const cookies = [
    cookie({ role: "viewer" }),
    cookie({ role: "admin" }, { subject: "other@example.com" }),
    cookie({ role: "admin" }, { audience: "other-app" }),
    cookie({ role: "admin" }, { expiresIn: -1 }),
  ];
  for (const value of cookies)
    assert.equal(
      (await request(app).get("/api/auth/me").set("Cookie", value)).status,
      401,
    );
});
test("strict upload validation rejects path traversal, MIME spoofing, oversized and extra fields", () => {
  const valid = { name: "Film.mp4", size: 1024, mimeType: "video/mp4" };
  assert.equal(fileSchema(2048).parse(valid).name, "Film.mp4");
  for (const patch of [
    { name: "../film.mp4" },
    { name: "film.mov" },
    { mimeType: "text/html" },
    { size: 4096 },
    { size: -1 },
    { owner: "someone-else" },
    { key: "existing.mp4" },
  ])
    assert.equal(
      fileSchema(2048).safeParse({ ...valid, ...patch }).success,
      false,
    );
  assert.equal(escapeRegex("film[1].mp4"), "film\\[1\\]\\.mp4");
});
test("MP4 signature validation inspects the container and rejects forged files", () => {
  assert.equal(validateMp4Header(mp4()), true);
  assert.equal(
    validateMp4Header(Buffer.from("not a video file at all")),
    false,
  );
  const unsupported = mp4();
  unsupported.write("heic", 8);
  unsupported.write("heic", 16);
  assert.equal(validateMp4Header(unsupported), false);
});
test("Multer header validation checks bytes and caps buffered data at 4096 bytes", async () => {
  const good = await request(app)
    .post("/api/videos/validate")
    .set("Cookie", cookie())
    .set("Origin", origin)
    .attach("header", mp4(), "sample.bin");
  assert.equal(good.status, 200);
  const bad = await request(app)
    .post("/api/videos/validate")
    .set("Cookie", cookie())
    .set("Origin", origin)
    .attach("header", Buffer.from("not a video file"), "sample.bin");
  assert.equal(bad.status, 415);
  const large = await request(app)
    .post("/api/videos/validate")
    .set("Cookie", cookie())
    .set("Origin", origin)
    .attach("header", Buffer.alloc(4097), "sample.bin");
  assert.equal(large.status, 413);
});
test("video access is scoped to the authenticated owner", async () => {
  let query;
  const method = mock.method(Video, "findOne", (filter) => {
    query = filter;
    return { select: async () => null };
  });
  try {
    const result = await request(app)
      .get("/api/videos/012345678901234567890123")
      .set("Cookie", cookie());
    assert.equal(result.status, 404);
    assert.equal(query.owner, "admin@example.com");
    assert.equal(query.status, "ready");
  } finally {
    method.mock.restore();
  }
});
test("renaming and notes update only the owner's ready video metadata without storage requests", async (t) => {
  const id = "012345678901234567890123";
  const state = {
    _id: id,
    owner: "admin@example.com",
    name: "Original.mp4",
    note: "",
    key: "videos/original.mp4",
    thumbnailKey: "thumbnail/original.webp",
    size: 1024,
    favorite: true,
  };
  const writes = [];
  t.mock.method(s3, "send", () => {
    assert.fail("Metadata edits must not contact object storage");
  });
  t.mock.method(Video, "findOneAndUpdate", (filter, update, options) => {
    assert.deepEqual(filter, { _id: id, owner: state.owner, status: "ready" });
    assert.equal(options.new, true);
    assert.equal(options.runValidators, true);
    writes.push(update);
    Object.assign(state, update.$set);
    return { select: async () => new Video(state) };
  });
  const patch = (body) => request(app)
    .patch(`/api/videos/${id}`)
    .set("Cookie", cookie())
    .set("Origin", origin)
    .send(body);
  for (const body of [
    { name: "  Wedding highlights  " },
    { note: "  First cut\nReview the ending.  " },
    { note: "" },
    { name: "Final edit.mp4", note: "Approved", favorite: false },
  ]) {
    const result = await patch(body);
    assert.equal(result.status, 200);
    for (const [field, value] of Object.entries(body))
      assert.equal(result.body.data.video[field], typeof value === "string" ? value.trim() : value);
    assert.equal(result.body.data.video.key, undefined);
    assert.equal(result.body.data.video.owner, undefined);
    assert.equal(result.body.data.video.__v, undefined);
    assert.match(result.body.data.video.thumbnailUrl, /X-Amz-Signature/);
  }
  assert.deepEqual(writes[0], { $set: { name: "Wedding highlights" } });
  assert.deepEqual(writes[1], { $set: { note: "First cut\nReview the ending." } });
  assert.equal(state.key, "videos/original.mp4");
  assert.equal(state.thumbnailKey, "thumbnail/original.webp");
  assert.equal(state.size, 1024);
});
test("metadata edits reject invalid fields and values before querying MongoDB", async (t) => {
  t.mock.method(Video, "findOneAndUpdate", () => assert.fail("Invalid metadata reached MongoDB"));
  for (const body of [
    {}, { name: "   " }, { name: "a".repeat(181) }, { name: "../clip.mp4" },
    { name: "line\nbreak" }, { name: null }, { note: null }, { note: 123 },
    { note: "a".repeat(5001) }, { favorite: "true" },
    { key: "videos/other.mp4" }, { thumbnailKey: "thumbnail/other.webp" },
    { owner: "other@example.com" }, { __v: 3 }, { name: "Title", size: 1 },
  ]) {
    const result = await request(app)
      .patch("/api/videos/012345678901234567890123")
      .set("Cookie", cookie())
      .set("Origin", origin)
      .send(body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.error.code, "VALIDATION_ERROR");
  }
  const invalidId = await request(app)
    .patch("/api/videos/not-an-id")
    .set("Cookie", cookie())
    .set("Origin", origin)
    .send({ name: "Title" });
  assert.equal(invalidId.status, 400);
});
test("metadata edits cannot change unowned, deleted, or deleting videos", async (t) => {
  let filter;
  t.mock.method(Video, "findOneAndUpdate", (query) => {
    filter = query;
    return { select: async () => null };
  });
  const result = await request(app)
    .patch("/api/videos/012345678901234567890123")
    .set("Cookie", cookie())
    .set("Origin", origin)
    .send({ note: "Private note" });
  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, "NOT_FOUND");
  assert.equal(filter.owner, "admin@example.com");
  assert.equal(filter.status, "ready");
});
test("metadata edits preserve origin protection", async () => {
  for (const value of [undefined, "https://attacker.example"]) {
    let req = request(app)
      .patch("/api/videos/012345678901234567890123")
      .set("Cookie", cookie())
      .send({ name: "Title" });
    if (value) req = req.set("Origin", value);
    assert.equal((await req).status, 403);
  }
});
test("all MongoDB models save without version keys and enforce note limits", async (t) => {
  const documents = [
    new Video({
      owner: "admin@example.com", name: "Clip.mp4", key: "videos/clip.mp4",
      size: 1024,
    }),
    new Admin({
      email: "admin@example.com",
      name: "admin",
      passwordHash: process.env.AUTH_PASSWORD_HASH,
    }),
    new StorageCleanup({ owner: "admin@example.com", key: "videos/cleanup.mp4", deleteAfter: new Date() }),
  ];
  for (const document of documents) {
    let inserted;
    t.mock.method(document.constructor.collection, "insertOne", async (fields) => {
      inserted = fields;
      return { acknowledged: true, insertedId: fields._id };
    });
    await document.save();
    assert.ok(inserted);
    assert.equal(Object.hasOwn(inserted, "__v"), false);
    assert.ok(inserted.createdAt instanceof Date);
  }
  assert.equal(documents[0].note, "");
  const video = new Video({ note: "a".repeat(5001) });
  assert.ok(video.validateSync().errors.note);
});
test("S3 verification checks exact size, MIME type, session metadata and MP4 bytes", async () => {
  const session = { id: "upload-test", key: "videos/test.mp4", size: 24 };
  let head = {
      ContentLength: 24,
      ContentType: "video/mp4",
      Metadata: { "upload-id": session.id },
    },
    bytes = mp4();
  const method = mock.method(s3, "send", async (command) =>
    command.constructor.name === "HeadObjectCommand"
      ? head
      : { Body: { transformToByteArray: async () => bytes } },
  );
  try {
    await verifyObject(session);
    head = { ...head, ContentLength: 99 };
    await assert.rejects(verifyObject(session), { status: 422 });
    head = { ...head, ContentLength: 24, ContentType: "text/html" };
    await assert.rejects(verifyObject(session), { status: 422 });
    head = { ...head, ContentType: "video/mp4" };
    bytes = Buffer.from("forged content");
    await assert.rejects(verifyObject(session), { status: 415 });
  } finally {
    method.mock.restore();
  }
});
test("single uploads are immutable presigned PUTs; playback signs private GETs", async () => {
  const result = await createUpload({
    id: "test",
    owner: "admin@example.com",
    key: "videos/test.mp4",
    size: 100,
  });
  const url = new URL(result.url);
  assert.equal(url.host, "s3.us-west-004.backblazeb2.com");
  assert.equal(url.pathname, "/frame-test-bucket/videos/test.mp4");
  assert.equal(result.headers["If-None-Match"], "*");
  assert.equal(result.headers["Content-Type"], "video/mp4");
  assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /content-length/);
  assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /if-none-match/);
  const playback = await playbackUrl({
    key: "videos/test.mp4",
    name: "My film.mp4",
  });
  assert.match(playback.url, /X-Amz-Signature/);
  assert.ok(new Date(playback.expiresAt) > new Date());
});
test("unknown endpoints use the consistent error envelope", async () => {
  const res = await request(app).get("/api/not-found");
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, "NOT_FOUND");
  assert.ok(res.body.error.requestId);
});
