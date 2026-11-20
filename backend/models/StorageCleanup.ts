import mongoose from "mongoose";

// Object keys recorded before they are written to storage. After deleteAfter,
// the cleanup worker deletes the object unless a ready video references it.
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    deleteAfter: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
export default mongoose.model("StorageCleanup", schema);
