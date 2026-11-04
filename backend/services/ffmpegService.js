import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { env } from "../config/env.js";
import { assertMp4 } from "../utils/validation.js";
import { resolveFfmpegArgs } from "../utils/ffmpegArgs.js";
import { HttpError } from "../utils/http.js";

export async function assertFileMp4(filePath) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, 4096, 0);
    assertMp4(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function run(args, signal, timeoutMs, failure) {
  return new Promise((resolve, reject) => {
    const child = spawn(env.FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(kill, timeoutMs);
    signal?.addEventListener("abort", kill, { once: true });
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
    };
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => {
      finish();
      reject(
        error.code === "ENOENT"
          ? new HttpError(422, "ffmpeg is not available on the server.", "FFMPEG_UNAVAILABLE")
          : error,
      );
    });
    child.on("close", (code) => {
      finish();
      if (signal?.aborted)
        return reject(new HttpError(499, "Upload cancelled.", "UPLOAD_CANCELLED"));
      if (code === 0) return resolve();
      console.error({ ffmpeg: stderr });
      reject(failure());
    });
  });
}

export const remux = (inputPath, outputPath, signal) =>
  run(
    resolveFfmpegArgs(env.FFMPEG_ARGS, inputPath, outputPath),
    signal,
    30 * 60 * 1000,
    () => new HttpError(422, "This video could not be prepared for playback.", "FFMPEG_FAILED"),
  );

// Seeking past the end exits successfully without writing a file; callers check the output.
// One frame of the first real video stream, scaled to square pixels so the
// display aspect ratio survives. sharp encodes the WebP from this PNG.
export const extractFrame = (inputPath, outputPath, seconds, signal) =>
  run(
    [
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-ss",
      seconds.toFixed(3),
      "-i",
      inputPath,
      "-map",
      "0:V:0",
      "-frames:v",
      "1",
      "-vf",
      "scale=iw*sar:ih,setsar=1",
      "-f",
      "image2",
      "-c:v",
      "png",
      "-y",
      outputPath,
    ],
    signal,
    2 * 60 * 1000,
    () =>
      new HttpError(422, "A thumbnail could not be created from this video.", "THUMBNAIL_FAILED"),
  );
