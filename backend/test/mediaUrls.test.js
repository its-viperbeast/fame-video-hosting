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
  APP_BASE_URL: "http://localhost:9090",
  SESSION_SECRET: "s".repeat(40),
  AUTH_EMAIL: "admin@example.com",
  AUTH_PASSWORD_HASH: `${salt}:${scryptSync("correct-test-password", salt, 64).toString("hex")}`,
  MEDIA_BASE_URL: "https://media.example.com/",
});
const { app } = await import("../app.js");
const { parseEnv } = await import("../config/env.js");
const { playbackUrl, thumbnailUrl } = await import("../services/s3Service.js");
const { default: Video } = await import("../models/Video.js");
const { installAdmin } = await import("./installAdmin.js");
installAdmin();

const owner = "admin@example.com";
const id = "012345678901234567890123";
const cookie = `frame_session=${jwt.sign({ role: "admin" }, process.env.SESSION_SECRET, { subject: owner, audience: "frame-api", issuer: "frame", expiresIn: "1h" })}`;
const video = {
  _id: id,
  id,
  owner,
  name: "My film.mp4",
  key: "videos/0f8b1a52-7f1e-4c39-9a8e-1d2c3b4a5f60.mp4",
  thumbnailKey: "thumbnail/7d2e9c41-3b5a-4f6e-8c1d-2a3b4c5d6e7f.webp",
  toJSON: () => ({ id, name: "My film.mp4" }),
};

test("playback and thumbnails use the public media origin plus the object key", async () => {
  assert.equal(
    await thumbnailUrl(video.thumbnailKey),
    `https://media.example.com/${video.thumbnailKey}`,
  );
  // A public link does not expire, so the player has nothing to renew.
  assert.deepEqual(await playbackUrl(video), {
    url: `https://media.example.com/${video.key}`,
  });
});

test("downloads stay signed so the browser saves the file under its name", async () => {
  const { url, expiresAt } = await playbackUrl(video, true);
  const signed = new URL(url);
  assert.equal(signed.host, "s3.us-west-004.backblazeb2.com");
  assert.match(signed.searchParams.get("X-Amz-Signature"), /^[a-f0-9]{64}$/);
  assert.match(
    signed.searchParams.get("response-content-disposition"),
    /^attachment;.*My%20film\.mp4/,
  );
  assert.ok(expiresAt);
});

test("the play endpoint returns the public link only for the owner's video", async (t) => {
  let filter;
  t.mock.method(Video, "findOne", (f) => {
    filter = f;
    return { select: async () => (f._id === id ? video : null) };
  });
  const res = await request(app)
    .get(`/api/videos/${id}/play`)
    .set("Cookie", cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.url, `https://media.example.com/${video.key}`);
  assert.equal(filter.owner, owner);
  const other = await request(app)
    .get("/api/videos/111111111111111111111111/play")
    .set("Cookie", cookie);
  assert.equal(other.status, 404);
  const anonymous = await request(app).get(`/api/videos/${id}/play`);
  assert.equal(anonymous.status, 401);
});

test("library responses carry the public thumbnail link", async (t) => {
  const chain = {
    select: () => chain,
    sort: () => chain,
    skip: () => chain,
    limit: async () => [video],
  };
  t.mock.method(Video, "find", () => chain);
  t.mock.method(Video, "countDocuments", async () => 1);
  t.mock.method(Video, "aggregate", async () => [{ total: 1, size: 10 }]);
  const res = await request(app).get("/api/videos").set("Cookie", cookie);
  assert.equal(res.status, 200);
  assert.equal(
    res.body.data.videos[0].thumbnailUrl,
    `https://media.example.com/${video.thumbnailKey}`,
  );
  assert.equal(JSON.stringify(res.body).includes("X-Amz"), false);
  mock.restoreAll();
});

test("MEDIA_BASE_URL must be https, and is optional", () => {
  const base = { ...process.env };
  assert.equal(
    parseEnv({ ...base, MEDIA_BASE_URL: "" }).MEDIA_BASE_URL,
    undefined,
  );
  assert.equal(
    parseEnv({ ...base, MEDIA_BASE_URL: "https://cdn.example.com/media/" })
      .MEDIA_BASE_URL,
    "https://cdn.example.com/media",
  );
  for (const bad of [
    "http://media.example.com",
    "https://media.example.com/?token=1",
    "not a url",
  ])
    assert.throws(() => parseEnv({ ...base, MEDIA_BASE_URL: bad }));
});
