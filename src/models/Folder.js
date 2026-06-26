import mongoose from "mongoose";

const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: "New Folder" },
  },
  { timestamps: true }
);

folderSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export const Folder = mongoose.model("Folder", folderSchema);
