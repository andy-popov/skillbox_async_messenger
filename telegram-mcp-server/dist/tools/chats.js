import { z } from "zod";
import { callTelegramApi, formatTelegramError } from "../services/telegram-client.js";
import { formatChatLine, formatUserLine, truncateJson } from "../services/format.js";
import { ChatIdSchema, ResponseFormat, ResponseFormatSchema } from "../schemas/common.js";
export function registerChatTools(server) {
    // --- telegram_get_me -------------------------------------------------
    server.registerTool("telegram_get_me", {
        title: "Get Bot Identity",
        description: `Fetch this bot's own identity and capabilities from Telegram. Useful to verify the TELEGRAM_BOT_TOKEN is valid and to get the bot's username.

Returns: { id, is_bot, first_name, username } for the bot account this server is authenticated as.

Use when: confirming the server is correctly configured, or you need the bot's own @username (e.g. to build a t.me link).`,
        inputSchema: z.object({}).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async () => {
        try {
            const me = await callTelegramApi("getMe");
            return {
                content: [{ type: "text", text: formatUserLine(me) }],
                structuredContent: { bot: me },
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_get_chat -------------------------------------------------
    const GetChatSchema = z.object({ chat_id: ChatIdSchema, response_format: ResponseFormatSchema }).strict();
    server.registerTool("telegram_get_chat", {
        title: "Get Telegram Chat Info",
        description: `Fetch metadata about a chat, group, supergroup, or channel: title, type, description, invite link.

Args:
  - chat_id (number | string): Chat ID or "@username"
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Chat details including id, type, title/name, and description if set.

Error Handling:
  - Returns "Error: Not found" if the bot has never interacted with this chat and chat_id is not a public @username`,
        inputSchema: GetChatSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const chat = await callTelegramApi("getChat", { chat_id: params.chat_id });
            const text = params.response_format === ResponseFormat.JSON ? truncateJson(chat) : formatChatLine(chat);
            return { content: [{ type: "text", text }], structuredContent: { chat } };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_get_chat_member_count -------------------------------------------------
    const GetChatMemberCountSchema = z.object({ chat_id: ChatIdSchema }).strict();
    server.registerTool("telegram_get_chat_member_count", {
        title: "Get Telegram Chat Member Count",
        description: `Get the number of members in a group, supergroup, or channel.

Args:
  - chat_id (number | string): Chat ID or "@username"

Returns: The member count as a number.`,
        inputSchema: GetChatMemberCountSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const count = await callTelegramApi("getChatMemberCount", params);
            return {
                content: [{ type: "text", text: `Chat ${params.chat_id} has ${count} member(s).` }],
                structuredContent: { chat_id: params.chat_id, member_count: count },
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_get_chat_member -------------------------------------------------
    const GetChatMemberSchema = z
        .object({
        chat_id: ChatIdSchema,
        user_id: z.number().int().describe("Telegram user ID to look up"),
        response_format: ResponseFormatSchema,
    })
        .strict();
    server.registerTool("telegram_get_chat_member", {
        title: "Get Telegram Chat Member",
        description: `Look up a specific member's status and role in a chat (creator, administrator, member, restricted, left, kicked).

Args:
  - chat_id (number | string): Chat ID or "@username"
  - user_id (number): The member's Telegram user ID
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: The member's status and user profile.

Error Handling:
  - Returns "Error: Bad request" if the user is not (and has never been) a member of the chat`,
        inputSchema: GetChatMemberSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const member = await callTelegramApi("getChatMember", params);
            const text = params.response_format === ResponseFormat.JSON
                ? truncateJson(member)
                : `${formatUserLine(member.user)} — status: ${member.status}`;
            return { content: [{ type: "text", text }], structuredContent: { member } };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_get_chat_administrators -------------------------------------------------
    const GetChatAdministratorsSchema = z.object({ chat_id: ChatIdSchema, response_format: ResponseFormatSchema }).strict();
    server.registerTool("telegram_get_chat_administrators", {
        title: "List Telegram Chat Administrators",
        description: `List all administrators (and the creator) of a group, supergroup, or channel.

Args:
  - chat_id (number | string): Chat ID or "@username"
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Array of chat members with status 'creator' or 'administrator', including each member's user profile.

Don't use when: chat_id refers to a private (1:1) chat — Telegram only supports this for groups/channels.`,
        inputSchema: GetChatAdministratorsSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const admins = await callTelegramApi("getChatAdministrators", {
                chat_id: params.chat_id,
            });
            if (params.response_format === ResponseFormat.JSON) {
                return { content: [{ type: "text", text: truncateJson(admins) }], structuredContent: { administrators: admins } };
            }
            const lines = [`# Administrators of chat ${params.chat_id}`, "", `Found ${admins.length} administrator(s)`, ""];
            for (const admin of admins) {
                lines.push(`- ${formatUserLine(admin.user)} — ${admin.status}${admin.custom_title ? ` ("${admin.custom_title}")` : ""}`);
            }
            return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { administrators: admins } };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_ban_chat_member -------------------------------------------------
    const BanChatMemberSchema = z
        .object({
        chat_id: ChatIdSchema,
        user_id: z.number().int().describe("Telegram user ID to ban"),
        until_date: z
            .number()
            .int()
            .optional()
            .describe("Unix timestamp when the ban is lifted. Omit (or <30s / >366 days from now) for a permanent ban."),
        revoke_messages: z
            .boolean()
            .default(false)
            .describe("Also delete all messages this user sent in the chat"),
    })
        .strict();
    server.registerTool("telegram_ban_chat_member", {
        title: "Ban Telegram Chat Member",
        description: `Ban a user from a group, supergroup, or channel, removing them from the chat. Requires the bot to be an admin with ban rights.

Args:
  - chat_id (number | string): Chat ID or "@username"
  - user_id (number): Telegram user ID to ban
  - until_date (number, optional): Unix timestamp when the ban lifts; omit for permanent
  - revoke_messages (boolean): Also delete the user's message history in this chat (default: false)

Error Handling:
  - Returns "Error: Forbidden" if the bot is not an admin or lacks ban rights, or the target is another admin`,
        inputSchema: BanChatMemberSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await callTelegramApi("banChatMember", params);
            return { content: [{ type: "text", text: `Banned user ${params.user_id} from chat ${params.chat_id}.` }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_unban_chat_member -------------------------------------------------
    const UnbanChatMemberSchema = z
        .object({
        chat_id: ChatIdSchema,
        user_id: z.number().int().describe("Telegram user ID to unban"),
        only_if_banned: z.boolean().default(true).describe("Do nothing if the user isn't currently banned"),
    })
        .strict();
    server.registerTool("telegram_unban_chat_member", {
        title: "Unban Telegram Chat Member",
        description: `Lift a ban on a user, allowing them to rejoin a group/supergroup (does not automatically re-add them). Requires the bot to be an admin with ban rights.

Args:
  - chat_id (number | string): Chat ID or "@username"
  - user_id (number): Telegram user ID to unban
  - only_if_banned (boolean): Skip silently if the user isn't banned (default: true)`,
        inputSchema: UnbanChatMemberSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await callTelegramApi("unbanChatMember", params);
            return { content: [{ type: "text", text: `Unbanned user ${params.user_id} in chat ${params.chat_id}.` }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
}
//# sourceMappingURL=chats.js.map