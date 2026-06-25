import "dotenv/config";
import express from "express";
import cors from "cors";
import { streamText } from "ai";
// import { deepseek } from "@ai-sdk/deepseek";
// import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";

// DEBUG: Check if key is loaded
console.log("API Key loaded:", process.env.GROQ_API_KEY ? "YES" : "NO");
console.log("Key starts with:", process.env.GROQ_API_KEY?.slice(0, 10));

const port = 3000;
const app = express();

// app.use(cors());
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

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
      // model: openai("gpt-4o-mini"), // Free model
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
