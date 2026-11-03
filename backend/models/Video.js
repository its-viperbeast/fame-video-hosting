import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    owner: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 180 },
    note: { type: String, default: "", maxlength: 5000 },
    key: { type: String, required: true, unique: true, select: false },
    thumbnailKey: { type: String, unique: true, sparse: true, select: false },
    size: { type: Number, required: true },
    mimeType: { type: String, default: "video/mp4" },
    duration: { type: Number, default: 0 },
    favorite: { type: Boolean, default: false },
    status: { type: String, enum: ["ready", "deleting"], default: "ready" },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.owner;
        delete ret.key;
        delete ret.thumbnailKey;
        delete ret.mimeType;
        delete ret.status;
        delete ret.updatedAt;
        return ret;
      },
    },
  },
);
schema.index({ owner: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, updatedAt: 1 });
export default mongoose.model("Video", schema);
