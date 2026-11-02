import "dotenv/config";
import mongoose from "mongoose";
import Video from "../models/Video.js";
import Admin from "../models/Admin.js";
import StorageCleanup from "../models/StorageCleanup.js";

try {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  for (const Model of [Video, Admin, StorageCleanup]) {
    // Use the collection directly: __v is no longer a schema field.
    const result = await Model.collection.updateMany(
      { __v: { $exists: true } },
      { $unset: { __v: "" } },
    );
    console.info(`${Model.collection.name}: removed __v from ${result.modifiedCount} records`);
  }
} catch (error) {
  // Connection errors can contain credentials or host details.
  console.error(`Version-key removal failed (${error.name}). Check MongoDB access and retry.`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
