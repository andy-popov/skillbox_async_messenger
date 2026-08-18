#!/usr/bin/env node
/**
 * MCP server for the Telegram Bot API.
 *
 * Exposes tools to send/edit/delete/forward messages, send photos and
 * documents, manage chat members and pins, and poll for incoming updates
 * (messages and callback queries) via a Telegram bot.
 *
 * Requires TELEGRAM_BOT_TOKEN — create a bot via @BotFather on Telegram to
 * obtain one.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerMessageTools } from "./tools/messages.js";
import { registerChatTools } from "./tools/chats.js";
import { registerUpdateTools } from "./tools/updates.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "telegram-mcp-server",
    version: "1.0.0",
  });

  registerMessageTools(server);
  registerChatTools(server);
  registerUpdateTools(server);

  return server;
}

function requireBotToken(): void {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error(
      "ERROR: TELEGRAM_BOT_TOKEN environment variable is required.\n" +
        "Create a bot via @BotFather on Telegram, then set:\n" +
        "  export TELEGRAM_BOT_TOKEN=123456:ABC-your-token"
    );
    process.exit(1);
  }
}

async function runStdio(): Promise<void> {
  requireBotToken();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("telegram-mcp-server running via stdio");
}

async function runHTTP(): Promise<void> {
  requireBotToken();

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    // New server + transport per request: stateless, avoids request-id collisions.
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`telegram-mcp-server running on http://localhost:${port}/mcp`);
  });
}

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
