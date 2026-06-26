import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { streamText } from "ai";
import { groq } from "@ai-sdk/groq";
import { Conversation } from "./models/Conversation.js";
import { Folder } from "./models/Folder.js";

console.log("API Key loaded:", process.env.GROQ_API_KEY ? "YES" : "NO");
console.log("Key starts with:", process.env.GROQ_API_KEY?.slice(0, 10));

const port = 3000;
const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

/* ---------- MongoDB Connection ---------- */
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/ai-chat";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

/* ---------- Folders ---------- */

// GET /api/folders — list all folders
app.get("/api/folders", async (req, res) => {
  try {
    const folders = await Folder.find().sort({ createdAt: -1 });
    res.json(folders);
  } catch (err) {
    console.error("GET /api/folders error:", err);
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

// POST /api/folders — create a new folder
app.post("/api/folders", async (req, res) => {
  try {
    const { name } = req.body;
    const folder = await Folder.create({ name: name || "New Folder" });
    res.status(201).json(folder);
  } catch (err) {
    console.error("POST /api/folders error:", err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

// PUT /api/folders/:id — rename folder
app.put("/api/folders/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true },
    );
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (err) {
    console.error("PUT /api/folders/:id error:", err);
    res.status(500).json({ error: "Failed to update folder" });
  }
});

// DELETE /api/folders/:id — delete folder and unassign its conversations
app.delete("/api/folders/:id", async (req, res) => {
  try {
    await Conversation.updateMany(
      { folderId: req.params.id },
      { folderId: null },
    );
    const folder = await Folder.findByIdAndDelete(req.params.id);
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/folders/:id error:", err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

/* ---------- Conversations ---------- */

// GET /api/conversations — list all conversations (optionally filtered by folderId)
app.get("/api/conversations", async (req, res) => {
  try {
    const filter = {};
    if (req.query.folderId) {
      filter.folderId =
        req.query.folderId === "null" ? null : req.query.folderId;
    }
    const conversations = await Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .select("-messages");
    res.json(conversations);
  } catch (err) {
    console.error("GET /api/conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// GET /api/conversations/:id — get full conversation with messages
app.get("/api/conversations/:id", async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    res.json(conv);
  } catch (err) {
    console.error("GET /api/conversations/:id error:", err);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// POST /api/conversations — create a new conversation
app.post("/api/conversations", async (req, res) => {
  try {
    const { title, folderId } = req.body;
    const conv = await Conversation.create({
      title: title || "New Chat",
      folderId: folderId || null,
      messages: [],
    });
    res.status(201).json(conv);
  } catch (err) {
    console.error("POST /api/conversations error:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// PUT /api/conversations/:id — update conversation title and/or messages
app.put("/api/conversations/:id", async (req, res) => {
  try {
    const { title, messages, folderId } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (folderId !== undefined) update.folderId = folderId || null;

    if (messages !== undefined) {
      // Sanitize: ensure every part has a valid text string (AI SDK can send
      // undefined text during streaming or non-text parts like tool-invocations)
      update.messages = messages
        .filter((msg) => msg.id && msg.role)
        .map((msg) => ({
          id: msg.id,
          role: msg.role,
          parts: (msg.parts || [])
            .filter((p) => p && typeof p.type === "string")
            .map((p) => ({
              type: p.type,
              text: typeof p.text === "string" ? p.text : "",
            })),
        }));
    }

    const conv = await Conversation.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!conv)
      return res.status(404).json({ error: "Conversation not found" });
    res.json(conv);
  } catch (err) {
    console.error("PUT /api/conversations/:id error:", err);
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

// DELETE /api/conversations/:id — delete a conversation
app.delete("/api/conversations/:id", async (req, res) => {
  try {
    const conv = await Conversation.findByIdAndDelete(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/conversations/:id error:", err);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

/* ---------- Chat / AI Streaming ---------- */
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Expected messages array" });
    }
    // Debug: check what frontend sends
    console.log("Received messages:", JSON.stringify(messages, null, 2));

    /*  const result = streamText({
          model: deepseek("deepseek-v4-pro"),
          prompt: "Who is the creator of Google",
          // system: "You are a helpful assistant",
          // messages: convertToModelMessages(messages),
          // prompt: convertToModelMessages(messages),
        }); */

    // Convert useChat v5 format (with parts) to AI SDK format
    const modelMessages = messages.map((msg) => {
      const text = msg.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
      return { role: msg.role, content: text };
    });

    const result = streamText({
      model: groq("llama-3.3-70b-versatile"),
      // prompt: "Who is the creator of Google",
      system: "You are a helpful assistant",
      messages: modelMessages,
    });
    // result.pipeTextStreamToResponse(res);

    // result.pipeDataStreamToResponse(res);

    // ✅ Correct method for Express
    // result.pipeTextStreamToResponse(res);
    //Method to stream UI messages to the ui

    result.pipeUIMessageStreamToResponse(res);
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port http://localhost:${port}`);
});
