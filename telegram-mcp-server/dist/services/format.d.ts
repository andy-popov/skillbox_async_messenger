import type { TelegramChat, TelegramMessage, TelegramUser } from "../types.js";
/** Truncates a JSON-serialized payload so responses stay within CHARACTER_LIMIT. */
export declare function truncateJson(payload: unknown): string;
export declare function formatUserLine(user: TelegramUser): string;
export declare function formatChatLine(chat: TelegramChat): string;
export declare function formatMessageMarkdown(message: TelegramMessage): string;
//# sourceMappingURL=format.d.ts.map