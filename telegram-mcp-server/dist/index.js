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
function createServer() {
    const server = new McpServer({
        name: "telegram-mcp-server",
        version: "1.0.0",
    });
    registerMessageTools(server);
    registerChatTools(server);
    registerUpdateTools(server);
    return server;
}
function requireBotToken() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.error("ERROR: TELEGRAM_BOT_TOKEN environment variable is required.\n" +
            "Create a bot via @BotFather on Telegram, then set:\n" +
            "  export TELEGRAM_BOT_TOKEN=123456:ABC-your-token");
        process.exit(1);
    }
}
/**
 * Runs `cleanup` exactly once and then terminates the process.
 *
 * Every exit path goes through here so the process can never linger after its
 * client is gone: an orphaned instance keeps holding the stdio pipes, the HTTP
 * port and the bot token's single getUpdates slot, which makes the next start
 * fail with "resource busy"/EADDRINUSE or a Telegram 409 Conflict.
 */
function createShutdown(cleanup) {
    let shuttingDown = false;
    return function shutdown(reason, exitCode = 0) {
        if (shuttingDown)
            return;
        shuttingDown = true;
        console.error(`telegram-mcp-server: shutting down (${reason})`);
        // Never let a stuck close() keep the process alive; unref'd so it does not
        // by itself delay an otherwise clean exit.
        const forceExit = setTimeout(() => process.exit(exitCode), 3000);
        forceExit.unref();
        void (async () => {
            try {
                await cleanup();
            }
            catch (error) {
                console.error("telegram-mcp-server: error during shutdown:", error);
            }
            process.exit(exitCode);
        })();
    };
}
/** Signals and fatal-error hooks that must terminate the process. */
function installLifecycleHandlers(shutdown) {
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    if (process.platform === "win32") {
        // Ctrl+Break and console-close on Windows; unknown signal elsewhere.
        signals.push("SIGBREAK");
    }
    for (const signal of signals) {
        process.on(signal, () => shutdown(signal));
    }
    process.on("uncaughtException", (error) => {
        console.error("telegram-mcp-server: uncaught exception:", error);
        shutdown("uncaughtException", 1);
    });
    process.on("unhandledRejection", (reason) => {
        console.error("telegram-mcp-server: unhandled rejection:", reason);
        shutdown("unhandledRejection", 1);
    });
}
/**
 * Exits when the MCP client that spawned us is gone.
 *
 * A client that is killed hard (Task Manager, a crash) never closes our stdin
 * on Windows, so the signal and stdin hooks above never fire and the server
 * survives as an orphan. Polling the parent pid is the only reliable way to
 * notice; the interval is unref'd so it never keeps the process alive itself.
 */
function watchParentProcess(shutdown) {
    const parentPid = process.ppid;
    // 0/1 means we were not spawned by a client we can meaningfully outlive.
    if (!parentPid || parentPid === 1)
        return;
    const timer = setInterval(() => {
        // POSIX reparents orphans to init; Windows keeps the stale pid, so also
        // probe whether the original parent still exists.
        if (process.ppid !== parentPid) {
            shutdown("parent process exited");
            return;
        }
        try {
            process.kill(parentPid, 0);
        }
        catch (error) {
            // EPERM means the process exists but is not ours to signal.
            if (error.code !== "EPERM") {
                shutdown("parent process exited");
            }
        }
    }, 5000);
    timer.unref();
}
async function runStdio() {
    requireBotToken();
    const server = createServer();
    const transport = new StdioServerTransport();
    const shutdown = createShutdown(() => server.close());
    installLifecycleHandlers(shutdown);
    // MCP clients stop a stdio server by closing its stdin. Without reacting to
    // that the process would survive its client and become the orphan that
    // blocks the next start.
    process.stdin.on("end", () => shutdown("stdin closed"));
    process.stdin.on("close", () => shutdown("stdin closed"));
    process.stdin.on("error", () => shutdown("stdin error", 1));
    transport.onclose = () => shutdown("transport closed");
    watchParentProcess(shutdown);
    await server.connect(transport);
    console.error("telegram-mcp-server running via stdio");
}
async function runHTTP() {
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
        // Close both, otherwise every request leaks a server instance.
        res.on("close", () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });
    const port = parseInt(process.env.PORT || "3000", 10);
    const httpServer = app.listen(port, () => {
        console.error(`telegram-mcp-server running on http://localhost:${port}/mcp`);
    });
    const shutdown = createShutdown(() => new Promise((resolve) => {
        // Drop keep-alive sockets so close() cannot hang on idle connections.
        httpServer.closeAllConnections?.();
        httpServer.close(() => resolve());
    }));
    installLifecycleHandlers(shutdown);
    httpServer.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            console.error(`ERROR: port ${port} is already in use — a previous telegram-mcp-server instance is probably still running.\n` +
                `Stop it first:\n` +
                `  Windows: netstat -ano | findstr :${port}    then    taskkill /PID <pid> /F\n` +
                `  macOS/Linux: lsof -ti tcp:${port} | xargs kill\n` +
                `Or start this one on a different port: PORT=3001 npm start`);
            process.exit(1);
        }
        console.error("telegram-mcp-server: HTTP server error:", error);
        process.exit(1);
    });
}
const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
    runHTTP().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
else {
    runStdio().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map