import { z } from "zod";
import Tag, { tagKey } from "../models/Tag.js";
import Video from "../models/Video.js";
import { objectId, tagNameInput } from "../utils/validation.js";
import { HttpError, ok } from "../utils/http.js";

const notFound = () => new HttpError(404, "Tag not found.", "NOT_FOUND");

async function ownedTag(req) {
  objectId.parse(req.params.id);
  const tag = await Tag.findOne({ _id: req.params.id, owner: req.user.id });
  if (!tag) throw notFound();
  return tag;
}

export async function list(req, res) {
  const tags = await Tag.find({ owner: req.user.id }).sort({ name: 1, _id: 1 }).lean();
  const counts =
    tags.length === 0
      ? []
      : await Video.aggregate([
          {
            $match: { owner: req.user.id, status: "ready", tags: { $in: tags.map((t) => t._id) } },
          },
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
        ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  ok(res, {
    tags: tags.map((tag) => ({
      id: String(tag._id),
      name: tag.name,
      videoCount: byId.get(String(tag._id)) || 0,
    })),
  });
}

export async function rename(req, res) {
  const tag = await ownedTag(req);
  const { name } = z.object({ name: tagNameInput }).strict().parse(req.body);
  const key = tagKey(name);
  const clash = await Tag.findOne({ owner: req.user.id, nameKey: key, _id: { $ne: tag._id } });
  if (clash) {
    // Merging keeps every video: move this tag's videos onto the existing one.
    await Video.updateMany(
      { owner: req.user.id, tags: tag._id },
      { $addToSet: { tags: clash._id } },
    );
    await Video.updateMany({ owner: req.user.id, tags: tag._id }, { $pull: { tags: tag._id } });
    await Tag.deleteOne({ _id: tag._id });
    ok(res, { tag: clash.toJSON(), merged: true });
    return;
  }
  tag.name = name;
  tag.nameKey = key;
  await tag.save();
  ok(res, { tag: tag.toJSON(), merged: false });
}

export async function remove(req, res) {
  const tag = await ownedTag(req);
  await Video.updateMany({ owner: req.user.id, tags: tag._id }, { $pull: { tags: tag._id } });
  await Tag.deleteOne({ _id: tag._id });
  ok(res, { deleted: true, id: tag.id });
}
