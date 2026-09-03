# telegram-mcp-server

MCP server exposing the [Telegram Bot API](https://core.telegram.org/bots/api) as tools for LLM agents: send/edit/delete/forward messages, send photos and documents, manage chat members and pins, and poll for incoming messages/button presses.

## Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram and copy its token.
2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

3. Set the bot token:

   ```bash
   export TELEGRAM_BOT_TOKEN="123456:ABC-your-token"
   ```

## Running

**stdio** (default — for local MCP clients like Claude Code/Desktop):

```bash
npm start
```

**Streamable HTTP** (for remote clients):

```bash
TRANSPORT=http PORT=3000 npm start
```

### Registering with an MCP client

This repo already wires it up for Claude Code: [`/.mcp.json`](../.mcp.json) registers the `telegram` server (project-approved via `enabledMcpjsonServers` in [`/.claude/settings.json`](../.claude/settings.json)), pulling `TELEGRAM_BOT_TOKEN` from your shell environment. After `npm install && npm run build` here and exporting `TELEGRAM_BOT_TOKEN` in your shell, Claude Code picks up the `telegram` tools automatically on the next session.

For other MCP clients, or to point at this server from outside the repo, use an entry like:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/absolute/path/to/telegram-mcp-server/dist/index.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "123456:ABC-your-token"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `telegram_get_me` | Verify the bot token and get the bot's identity |
| `telegram_send_message` | Send a text message |
| `telegram_edit_message_text` | Edit a previously sent message |
| `telegram_delete_message` | Delete a message |
| `telegram_forward_message` | Forward a message between chats |
| `telegram_send_chat_action` | Show a "typing…" style status indicator |
| `telegram_send_photo` | Send a photo by URL or file_id |
| `telegram_send_document` | Send a file by URL or file_id |
| `telegram_pin_chat_message` / `telegram_unpin_chat_message` | Pin/unpin a message |
| `telegram_get_chat` | Get chat metadata |
| `telegram_get_chat_member_count` | Count chat members |
| `telegram_get_chat_member` | Look up a member's status |
| `telegram_get_chat_administrators` | List chat admins |
| `telegram_ban_chat_member` / `telegram_unban_chat_member` | Ban/unban a user |
| `telegram_get_updates` | Poll for incoming messages and button presses (callback queries) |
| `telegram_answer_callback_query` | Respond to an inline-keyboard button press |

Every tool that returns Telegram objects supports `response_format: "markdown" \| "json"` (default `markdown`).

## Troubleshooting

### "The process cannot access the file because it is being used by another process" / port already in use, and a `node` process stays in Task Manager

An earlier instance of the server is still alive and holding the resource the
new one needs: the HTTP port, the `dist/` files a rebuild wants to overwrite,
or the bot token's single `getUpdates` slot. Restarting without killing it
reproduces the same error every time.

Find and stop the leftover process:

```powershell
# Windows (PowerShell / cmd)
netstat -ano | findstr :3000      # PID holding the HTTP port
tasklist | findstr node           # or list every node process
taskkill /PID <pid> /F
```

```bash
# macOS / Linux
lsof -ti tcp:3000 | xargs kill    # process holding the HTTP port
pkill -f telegram-mcp-server
```

Then start again. The server now shuts itself down when its client goes away
(stdin closes, the parent process exits, or it receives SIGINT/SIGTERM/SIGHUP),
so orphans should not accumulate; a busy port is reported with an actionable
message instead of an unhandled `EADDRINUSE` crash.

### "Conflict: terminated by other getUpdates request" (409)

Telegram allows only one poller per bot token. Either a second copy of this
server is running, or a webhook is configured for the bot. Stop the extra
process (see above), or delete the webhook, before polling again.

### Claude Code shows the `telegram` server as failed / "connection closed"

`.mcp.json` runs `telegram-mcp-server/dist/index.js`, which is gitignored and
must be built locally, and the server exits immediately when
`TELEGRAM_BOT_TOKEN` is unset:

```bash
cd telegram-mcp-server && npm install   # runs the build via "prepare"
export TELEGRAM_BOT_TOKEN="123456:ABC-your-token"
```

Then restart Claude Code so it re-spawns the server.

## Development

```bash
npm run dev     # tsx watch mode
npm run build   # compile to dist/
```

Test interactively with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
