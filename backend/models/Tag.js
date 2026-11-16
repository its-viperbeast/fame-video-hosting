import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    owner: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 30 },
    nameKey: { type: String, required: true, maxlength: 30, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.owner;
        delete ret.nameKey;
        delete ret.createdAt;
        delete ret.updatedAt;
        return ret;
      },
    },
  },
);

// One tag name per user, matched case-insensitively through nameKey.
schema.index({ owner: 1, nameKey: 1 }, { unique: true });
schema.index({ owner: 1, name: 1 });

export function normalizeTagName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function tagKey(value) {
  return normalizeTagName(value).toLowerCase();
}

export default mongoose.model("Tag", schema);
