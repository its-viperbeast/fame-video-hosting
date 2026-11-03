// +faststart rewrites the moov atom, so both ends must be seekable files.
// pipe:0 and pipe:1 stay in FFMPEG_ARGS and are replaced with those files here.
export function resolveFfmpegArgs(template, inputPath, outputPath) {
  const args = template
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token === "pipe:0" ? inputPath : token === "pipe:1" ? outputPath : token));
  if (!args.includes(inputPath) || !args.includes(outputPath))
    throw new Error("FFMPEG_ARGS must include pipe:0 and pipe:1");
  return args;
}
