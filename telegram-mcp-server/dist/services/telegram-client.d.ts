export declare class TelegramApiError extends Error {
    readonly errorCode?: number | undefined;
    readonly retryAfter?: number | undefined;
    constructor(message: string, errorCode?: number | undefined, retryAfter?: number | undefined);
}
/**
 * Calls a Telegram Bot API method and unwraps the `{ok, result}` envelope.
 * Throws TelegramApiError with an actionable message on failure so tool
 * handlers can turn it directly into a text response for the agent.
 */
export declare function callTelegramApi<T>(method: string, params?: Record<string, unknown>): Promise<T>;
/** Formats a TelegramApiError (or any error) into agent-actionable text. */
export declare function formatTelegramError(error: unknown): string;
//# sourceMappingURL=telegram-client.d.ts.map