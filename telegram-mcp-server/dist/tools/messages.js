import { z } from "zod";
import { callTelegramApi, formatTelegramError } from "../services/telegram-client.js";
import { formatMessageMarkdown, truncateJson } from "../services/format.js";
import { ChatIdSchema, MessageIdSchema, ResponseFormat, ResponseFormatSchema } from "../schemas/common.js";
import { MAX_CAPTION_LENGTH, MAX_MESSAGE_LENGTH } from "../constants.js";
function respondWithMessage(message, format) {
    const text = format === ResponseFormat.JSON
        ? truncateJson(message)
        : formatMessageMarkdown(message);
    return {
        content: [{ type: "text", text }],
        structuredContent: { message },
    };
}
export function registerMessageTools(server) {
    // --- telegram_send_message -------------------------------------------------
    const SendMessageSchema = z
        .object({
        chat_id: ChatIdSchema,
        text: z
            .string()
            .min(1, "Text must not be empty")
            .max(MAX_MESSAGE_LENGTH, `Text must not exceed ${MAX_MESSAGE_LENGTH} characters`)
            .describe("Message text to send. Supports Telegram Markdown/HTML if parse_mode is set."),
        parse_mode: z
            .enum(["Markdown", "MarkdownV2", "HTML"])
            .optional()
            .describe("Text formatting mode. Omit to send as plain text."),
        reply_to_message_id: MessageIdSchema.optional().describe("If set, sends this message as a reply to the given message ID"),
        disable_notification: z
            .boolean()
            .default(false)
            .describe("Send silently — recipients get no notification sound"),
        response_format: ResponseFormatSchema,
    })
        .strict();
    server.registerTool("telegram_send_message", {
        title: "Send Telegram Message",
        description: `Send a text message to a Telegram chat, group, supergroup, or channel.

Args:
  - chat_id (number | string): Target chat ID or "@username" for public chats
  - text (string): Message text, up to ${MAX_MESSAGE_LENGTH} characters
  - parse_mode ('Markdown' | 'MarkdownV2' | 'HTML', optional): Enables rich text formatting
  - reply_to_message_id (number, optional): Reply to a specific message
  - disable_notification (boolean): Send silently (default: false)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: The sent message, including its message_id (needed for edit_message_text, delete_message, pin_chat_message).

Examples:
  - Use when: "Send 'Deploy finished' to chat 123456" -> chat_id=123456, text="Deploy finished"
  - Don't use when: broadcasting a photo or file (use telegram_send_photo / telegram_send_document instead)

Error Handling:
  - Returns "Error: Forbidden" if the bot was blocked by the user or lacks permission to post in the chat
  - Returns "Error: Bad request" if chat_id does not exist or parse_mode formatting is invalid`,
        inputSchema: SendMessageSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const message = await callTelegramApi("sendMessage", {
                chat_id: params.chat_id,
                text: params.text,
                parse_mode: params.parse_mode,
                reply_to_message_id: params.reply_to_message_id,
                disable_notification: params.disable_notification,
            });
            return respondWithMessage(message, params.response_format);
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_edit_message_text ---------------------------------------------
    const EditMessageTextSchema = z
        .object({
        chat_id: ChatIdSchema,
        message_id: MessageIdSchema,
        text: z
            .string()
            .min(1)
            .max(MAX_MESSAGE_LENGTH)
            .describe("New text for the message"),
        parse_mode: z.enum(["Markdown", "MarkdownV2", "HTML"]).optional(),
        response_format: ResponseFormatSchema,
    })
        .strict();
    server.registerTool("telegram_edit_message_text", {
        title: "Edit Telegram Message",
        description: `Edit the text of a previously sent message. Only works for messages sent by this bot, and only within 48 hours of sending.

Args:
  - chat_id (number | string): Chat containing the message
  - message_id (number): ID of the message to edit (returned by telegram_send_message)
  - text (string): New message text
  - parse_mode ('Markdown' | 'MarkdownV2' | 'HTML', optional): Formatting mode
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: The updated message.

Error Handling:
  - Returns "Error: Bad request" if the message is too old to edit, unchanged, or was not sent by this bot`,
        inputSchema: EditMessageTextSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const message = await callTelegramApi("editMessageText", {
                chat_id: params.chat_id,
                message_id: params.message_id,
                text: params.text,
                parse_mode: params.parse_mode,
            });
            return respondWithMessage(message, params.response_format);
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_delete_message -------------------------------------------------
    const DeleteMessageSchema = z
        .object({
        chat_id: ChatIdSchema,
        message_id: MessageIdSchema,
    })
        .strict();
    server.registerTool("telegram_delete_message", {
        title: "Delete Telegram Message",
        description: `Permanently delete a message from a chat. This cannot be undone.

Args:
  - chat_id (number | string): Chat containing the message
  - message_id (number): ID of the message to delete

Returns: Confirmation text once deleted.

Error Handling:
  - Returns "Error: Bad request" if the message is too old (>48h for private chats), already deleted, or not deletable by bots
  - Returns "Error: Forbidden" if the bot lacks delete rights (needs admin "can_delete_messages" in groups/channels)`,
        inputSchema: DeleteMessageSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await callTelegramApi("deleteMessage", params);
            return {
                content: [
                    {
                        type: "text",
                        text: `Message ${params.message_id} deleted from chat ${params.chat_id}.`,
                    },
                ],
                structuredContent: { deleted: true, chat_id: params.chat_id, message_id: params.message_id },
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_forward_message -------------------------------------------------
    const ForwardMessageSchema = z
        .object({
        chat_id: ChatIdSchema.describe("Destination chat to forward into"),
        from_chat_id: ChatIdSchema.describe("Source chat the message currently lives in"),
        message_id: MessageIdSchema,
        disable_notification: z.boolean().default(false),
        response_format: ResponseFormatSchema,
    })
        .strict();
    server.registerTool("telegram_forward_message", {
        title: "Forward Telegram Message",
        description: `Forward an existing message from one chat to another, preserving the "Forwarded from" attribution.

Args:
  - chat_id (number | string): Destination chat
  - from_chat_id (number | string): Source chat containing the message
  - message_id (number): ID of the message to forward
  - disable_notification (boolean): Send silently (default: false)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: The newly created forwarded message in the destination chat.

Don't use when: you want to resend content without attribution — copy the text into telegram_send_message instead.`,
        inputSchema: ForwardMessageSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const message = await callTelegramApi("forwardMessage", params);
            return respondWithMessage(message, params.response_format);
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_send_chat_action -------------------------------------------------
    const SendChatActionSchema = z
        .object({
        chat_id: ChatIdSchema,
        action: z
            .enum([
            "typing",
            "upload_photo",
            "record_video",
            "upload_video",
            "record_voice",
            "upload_voice",
            "upload_document",
            "choose_sticker",
            "find_location",
            "record_video_note",
            "upload_video_note",
        ])
            .describe("The status to display, e.g. 'typing' for text or 'upload_photo' before sending an image"),
    })
        .strict();
    server.registerTool("telegram_send_chat_action", {
        title: "Send Telegram Chat Action",
        description: `Show a transient status indicator (e.g. "Bot is typing...") in a chat. The indicator auto-clears after ~5 seconds or when the bot sends a message.

Args:
  - chat_id (number | string): Target chat
  - action (string): One of 'typing', 'upload_photo', 'record_video', 'upload_video', 'record_voice', 'upload_voice', 'upload_document', 'choose_sticker', 'find_location', 'record_video_note', 'upload_video_note'

Use when: giving the recipient feedback while the bot prepares a slower response (e.g. generating a document).
Don't use when: you can just send the message immediately — this is a UX nicety, not required.`,
        inputSchema: SendChatActionSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await callTelegramApi("sendChatAction", params);
            return { content: [{ type: "text", text: `Sent '${params.action}' action to chat ${params.chat_id}.` }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_send_photo -------------------------------------------------
    const SendPhotoSchema = z
        .object({
        chat_id: ChatIdSchema,
        photo: z
            .string()
            .min(1)
            .describe("Photo to send: a public HTTP(S) URL, or a file_id of a photo already on Telegram's servers"),
        caption: z.string().max(MAX_CAPTION_LENGTH).optional().describe(`Caption text, up to ${MAX_CAPTION_LENGTH} characters`),
        parse_mode: z.enum(["Markdown", "MarkdownV2", "HTML"]).optional(),
        reply_to_message_id: MessageIdSchema.optional(),
        response_format: ResponseFormatSchema,
    })
        .strict();
    server.registerTool("telegram_send_photo", {
        title: "Send Telegram Photo",
        description: `Send a photo to a chat, either by public URL or by reusing an existing Telegram file_id.

Args:
  - chat_id (number | string): Target chat
  - photo (string): Public image URL or an existing Telegram file_id
  - caption (string, optional): Caption shown under the photo, up to ${MAX_CAPTION_LENGTH} characters
  - parse_mode ('Markdown' | 'MarkdownV2' | 'HTML', optional): Formatting for the caption
  - reply_to_message_id (number, optional): Reply to a specific message
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: The sent message, including the photo's file_id for reuse.

Error Handling:
  - Returns "Error: Bad request" if the URL is unreachable or not a valid image, or the file_id is invalid/expired`,
        inputSchema: SendPhotoSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const message = await callTelegramApi("sendPhoto", {
                chat_id: params.chat_id,
                photo: params.photo,
                caption: params.caption,
                parse_mode: params.parse_mode,
                reply_to_message_id: params.reply_to_message_id,
            });
            return respondWithMessage(message, params.response_format);
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_send_document -------------------------------------------------
    const SendDocumentSchema = z
        .object({
        chat_id: ChatIdSchema,
        document: z
            .string()
            .min(1)
            .describe("Document to send: a public HTTP(S) URL, or a file_id of a document already on Telegram's servers"),
        caption: z.string().max(MAX_CAPTION_LENGTH).optional(),
        parse_mode: z.enum(["Markdown", "MarkdownV2", "HTML"]).optional(),
        reply_to_message_id: MessageIdSchema.optional(),
        response_format: ResponseFormatSchema,
    })
        .strict();
    server.registerTool("telegram_send_document", {
        title: "Send Telegram Document",
        description: `Send a file/document to a chat, either by public URL or by reusing an existing Telegram file_id.

Args:
  - chat_id (number | string): Target chat
  - document (string): Public file URL or an existing Telegram file_id
  - caption (string, optional): Caption shown under the file, up to ${MAX_CAPTION_LENGTH} characters
  - parse_mode ('Markdown' | 'MarkdownV2' | 'HTML', optional): Formatting for the caption
  - reply_to_message_id (number, optional): Reply to a specific message
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: The sent message, including the document's file_id for reuse.

Don't use when: sending a photo meant to display inline (use telegram_send_photo instead — documents are sent as downloadable files).`,
        inputSchema: SendDocumentSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const message = await callTelegramApi("sendDocument", {
                chat_id: params.chat_id,
                document: params.document,
                caption: params.caption,
                parse_mode: params.parse_mode,
                reply_to_message_id: params.reply_to_message_id,
            });
            return respondWithMessage(message, params.response_format);
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    // --- telegram_pin_chat_message / unpin -------------------------------------------------
    const PinMessageSchema = z
        .object({
        chat_id: ChatIdSchema,
        message_id: MessageIdSchema,
        disable_notification: z.boolean().default(false),
    })
        .strict();
    server.registerTool("telegram_pin_chat_message", {
        title: "Pin Telegram Message",
        description: `Pin a message at the top of a chat. Requires the bot to be an admin with "can_pin_messages" rights in groups/channels.

Args:
  - chat_id (number | string): Target chat
  - message_id (number): ID of the message to pin
  - disable_notification (boolean): Pin silently, without notifying members (default: false)

Error Handling:
  - Returns "Error: Forbidden" if the bot is not an admin or lacks pin rights`,
        inputSchema: PinMessageSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await callTelegramApi("pinChatMessage", params);
            return { content: [{ type: "text", text: `Pinned message ${params.message_id} in chat ${params.chat_id}.` }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
    const UnpinMessageSchema = z
        .object({
        chat_id: ChatIdSchema,
        message_id: MessageIdSchema.optional().describe("Message to unpin. Omit to unpin the chat's most recent pinned message."),
    })
        .strict();
    server.registerTool("telegram_unpin_chat_message", {
        title: "Unpin Telegram Message",
        description: `Unpin a message (or the most recently pinned one) from a chat. Requires admin "can_pin_messages" rights in groups/channels.

Args:
  - chat_id (number | string): Target chat
  - message_id (number, optional): Specific message to unpin; omit to unpin the most recent pin

Error Handling:
  - Returns "Error: Forbidden" if the bot is not an admin or lacks pin rights`,
        inputSchema: UnpinMessageSchema,
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await callTelegramApi("unpinChatMessage", params);
            return { content: [{ type: "text", text: `Unpinned message in chat ${params.chat_id}.` }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: formatTelegramError(error) }] };
        }
    });
}
//# sourceMappingURL=messages.js.map