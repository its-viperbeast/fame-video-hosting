// Rewrites stored video names with the same cleanup used on upload.
// Dry run by default. Pass --write to update the database.
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Video from "../models/Video.js";
import { normalizeVideoName } from "../utils/videoName.js";

const write = process.argv.includes("--write");

await connectDB();
try {
  const videos = await Video.find().select("name").lean();
  let changed = 0;
  for (const video of videos) {
    const next = normalizeVideoName(video.name);
    if (next === video.name) continue;
    changed += 1;
    console.log(`${video.name} -> ${next}`);
    if (write) await Video.updateOne({ _id: video._id }, { $set: { name: next } });
  }
  const noun = changed === 1 ? "name" : "names";
  if (changed === 0) console.log("No video names need cleanup.");
  else if (write) console.log(`Updated ${changed} video ${noun}.`);
  else console.log(`${changed} video ${noun} would change. Re-run with --write to apply.`);
} finally {
  await mongoose.disconnect();
}
