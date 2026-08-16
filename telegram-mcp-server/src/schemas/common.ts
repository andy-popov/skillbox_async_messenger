import { z } from "zod";

// A Telegram chat_id is either a numeric id or, for public channels/groups,
// an "@username" string. Both forms are accepted by every Bot API method
// that takes chat_id.
export const ChatIdSchema = z
  .union([z.number().int(), z.string().min(1)])
  .describe(
    "Target chat: numeric chat ID (e.g. 123456789, or -100... for supergroups/channels) or public @username (e.g. \"@mychannel\")"
  );

export const MessageIdSchema = z
  .number()
  .int()
  .positive()
  .describe("ID of the target message within the chat");

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable");
