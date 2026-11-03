import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: {
      type: String,
      required: true,
      select: false,
      match: /^[a-f0-9]{32}:[a-f0-9]{128}$/,
    },
    role: { type: String, enum: ["admin"], default: "admin" },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("Admin", schema);
