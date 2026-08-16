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

Example `.mcp.json` entry for stdio:

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

## Development

```bash
npm run dev     # tsx watch mode
npm run build   # compile to dist/
```

Test interactively with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
