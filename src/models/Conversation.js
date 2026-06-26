import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    parts: [
      {
        type: { type: String, required: true },
        text: { type: String, default: "" },
      },
    ],
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    title: { type: String, default: "New Chat" },
    folderId: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null },
    messages: [messageSchema],
  },
  { timestamps: true }
);

conversationSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

export const Conversation = mongoose.model("Conversation", conversationSchema);
