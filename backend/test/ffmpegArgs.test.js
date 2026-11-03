import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFfmpegArgs } from "../utils/ffmpegArgs.js";

const template =
  "-hide_banner -nostdin -i pipe:0 -map 0:V -map 0:a? -map 0:s? -c copy -movflags +faststart -f mp4 -y pipe:1";

test("faststart args keep the requested flags and use seekable files", () => {
  assert.deepEqual(resolveFfmpegArgs(template, "/tmp/in.mp4", "/tmp/out.mp4"), [
    "-hide_banner",
    "-nostdin",
    "-i",
    "/tmp/in.mp4",
    "-map",
    "0:V",
    "-map",
    "0:a?",
    "-map",
    "0:s?",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "-y",
    "/tmp/out.mp4",
  ]);
});

test("args must name both the input and output pipes", () => {
  assert.throws(() =>
    resolveFfmpegArgs("-c copy", "/tmp/in.mp4", "/tmp/out.mp4"),
  );
});
