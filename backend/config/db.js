import mongoose from "mongoose";
import { env } from "./env.js";
export async function connectDB() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.info("MongoDB connected");
}
