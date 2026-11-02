import { test } from "node:test";
import assert from "node:assert/strict";
import {
  thumbnailFileError,
  thumbnailSizeError,
} from "../src/services/thumbnail.js";
import { deleteVideos } from "../src/services/deleteVideos.js";

const MB = 1024 ** 2;
const file = (name, type, size = MB) => ({ name, type, size });

test("thumbnail files must be JPEG, PNG, or WebP within the size limit", () => {
  for (const ok of [
    file("cover.jpg", "image/jpeg"),
    file("cover.JPEG", "image/jpeg"),
    file("cover.png", "image/png"),
    file("cover.webp", "image/webp"),
  ])
    assert.equal(thumbnailFileError(ok, 10 * MB), "");
  assert.match(
    thumbnailFileError(file("cover.gif", "image/gif"), 10 * MB),
    /JPEG, PNG, or WebP/,
  );
  assert.match(
    thumbnailFileError(file("cover.png", "image/svg+xml"), 10 * MB),
    /JPEG, PNG, or WebP/,
  );
  assert.match(
    thumbnailFileError(file("cover.svg", "image/png"), 10 * MB),
    /JPEG, PNG, or WebP/,
  );
  assert.match(
    thumbnailFileError(file("cover.png", "image/png", 0), 10 * MB),
    /empty/,
  );
  assert.match(
    thumbnailFileError(file("cover.png", "image/png", 11 * MB), 10 * MB),
    /up to 10 MB/,
  );
});

test("thumbnail images need at least 180 pixels on each side", () => {
  assert.equal(thumbnailSizeError({ width: 1920, height: 1080 }), "");
  assert.equal(thumbnailSizeError({ width: 180, height: 180 }), "");
  assert.match(
    thumbnailSizeError({ width: 1920, height: 179 }),
    /at least 180/,
  );
});

test("deleting several videos continues past failures and reports only the unfinished ones", async () => {
  const videos = ["a", "b", "c", "d"].map((id) => ({ id }));
  const calls = [];
  const result = await deleteVideos(videos, async (id) => {
    calls.push(id);
    if (id === "b")
      throw Object.assign(new Error("Storage is down"), { status: 503 });
    if (id === "c")
      throw Object.assign(new Error("Video not found."), { status: 404 });
  });
  assert.deepEqual(calls, ["a", "b", "c", "d"]);
  assert.equal(result.deleted, 3);
  assert.deepEqual(result.failed, [{ id: "b" }]);
  assert.equal(result.error.message, "Storage is down");
  const retry = await deleteVideos(result.failed, async () => {});
  assert.deepEqual([retry.deleted, retry.failed, retry.error], [1, [], null]);
});
