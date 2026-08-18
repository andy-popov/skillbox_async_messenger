import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callTelegramApi, formatTelegramError } from "../services/telegram-client.js";
import { formatChatLine, formatUserLine, truncateJson } from "../services/format.js";
import { ResponseFormat, ResponseFormatSchema } from "../schemas/common.js";
import type { TelegramUpdate } from "../types.js";

export function registerUpdateTools(server: McpServer): void {
  // --- telegram_get_updates -------------------------------------------------
  const GetUpdatesSchema = z
    .object({
      offset: z
        .number()
        .int()
        .optional()
        .describe(
          "Only return updates with update_id >= offset. Pass (last_seen_update_id + 1) to fetch new updates and mark earlier ones as read; omit to see the oldest pending updates."
        ),
      limit: z.number().int().min(1).max(100).default(20).describe("Maximum updates to return"),
      timeout: z
        .number()
        .int()
        .min(0)
        .max(50)
        .default(0)
        .describe("Long-poll timeout in seconds. 0 returns immediately with whatever is pending."),
      response_format: ResponseFormatSchema,
    })
    .strict();

  server.registerTool(
    "telegram_get_updates",
    {
      title: "Get Telegram Updates",
      description: `Fetch incoming updates (new messages, edited messages, callback queries) sent to this bot, using long polling. This is how the bot "reads" messages from users — Telegram does not push messages to it otherwise.

IMPORTANT: This only works while no webhook is configured for the bot (the default). Calling this repeatedly with an increasing 'offset' is the standard way to drain the update queue.

Args:
  - offset (number, optional): Return only updates with update_id >= offset. Set to (highest update_id seen + 1) to acknowledge and skip previously fetched updates.
  - limit (number): Max updates to return, 1-100 (default: 20)
  - timeout (number): Long-poll wait in seconds, 0-50 (default: 0 = return immediately)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Array of updates, each with update_id and one of message/edited_message/channel_post/callback_query.

Examples:
  - Use when: "Check if anyone messaged the bot" -> call with no offset to see pending updates
  - Use when: polling loop -> track the highest update_id seen, pass offset=that+1 next call

Error Handling:
  - Returns "Error: Bad request" if a webhook is currently set (delete it first via BotFather or the setWebhook API before polling)`,
      inputSchema: GetUpdatesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: z.infer<typeof GetUpdatesSchema>) => {
      try {
        const updates = await callTelegramApi<TelegramUpdate[]>("getUpdates", {
          offset: params.offset,
          limit: params.limit,
          timeout: params.timeout,
        });

        const output = {
          count: updates.length,
          highest_update_id: updates.length ? updates[updates.length - 1].update_id : undefined,
          updates,
        };

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text" as const, text: truncateJson(output) }], structuredContent: output };
        }

        if (!updates.length) {
          return { content: [{ type: "text" as const, text: "No new updates." }], structuredContent: output };
        }

        const lines = [`# ${updates.length} Update(s)`, ""];
        for (const update of updates) {
          const msg = update.message ?? update.edited_message ?? update.channel_post;
          if (msg) {
            const kind = update.edited_message ? "edited message" : update.channel_post ? "channel post" : "message";
            lines.push(
              `- [${update.update_id}] ${kind} in ${formatChatLine(msg.chat)}${msg.from ? ` from ${formatUserLine(msg.from)}` : ""}: "${msg.text ?? msg.caption ?? "(no text)"}" (message_id: ${msg.message_id})`
            );
          } else if (update.callback_query) {
            lines.push(
              `- [${update.update_id}] callback_query "${update.callback_query.data ?? ""}" from ${formatUserLine(update.callback_query.from)} (callback_query_id: ${update.callback_query.id})`
            );
          } else {
            lines.push(`- [${update.update_id}] (unsupported update type)`);
          }
        }
        lines.push("", `Next offset to acknowledge these: ${output.highest_update_id! + 1}`);

        return { content: [{ type: "text" as const, text: lines.join("\n") }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatTelegramError(error) }] };
      }
    }
  );

  // --- telegram_answer_callback_query -------------------------------------------------
  const AnswerCallbackQuerySchema = z
    .object({
      callback_query_id: z.string().min(1).describe("The callback_query_id from an update's callback_query field"),
      text: z.string().max(200).optional().describe("Notification text shown to the user, up to 200 characters"),
      show_alert: z.boolean().default(false).describe("Show as a blocking alert dialog instead of a transient toast"),
    })
    .strict();

  server.registerTool(
    "telegram_answer_callback_query",
    {
      title: "Answer Telegram Callback Query",
      description: `Respond to a button press from an inline keyboard (a callback_query). This MUST be called for every callback_query received, even with an empty response, or the user's client shows a loading spinner until it times out.

Args:
  - callback_query_id (string): ID from the callback_query update
  - text (string, optional): Short notification text to show the user, up to 200 characters
  - show_alert (boolean): Show as a modal alert instead of a toast notification (default: false)

Use when: the bot has an inline keyboard and just received a callback_query update from telegram_get_updates.`,
      inputSchema: AnswerCallbackQuerySchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: z.infer<typeof AnswerCallbackQuerySchema>) => {
      try {
        await callTelegramApi<boolean>("answerCallbackQuery", params);
        return { content: [{ type: "text" as const, text: `Answered callback query ${params.callback_query_id}.` }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: formatTelegramError(error) }] };
      }
    }
  );
}
