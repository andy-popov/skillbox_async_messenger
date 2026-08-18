import axios, { AxiosError } from "axios";
import { TELEGRAM_API_BASE } from "../constants.js";
import type { TelegramApiResponse } from "../types.js";

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN environment variable is required. " +
        "Create a bot via @BotFather on Telegram and set the token before starting this server."
    );
  }
  return token;
}

/**
 * Calls a Telegram Bot API method and unwraps the `{ok, result}` envelope.
 * Throws TelegramApiError with an actionable message on failure so tool
 * handlers can turn it directly into a text response for the agent.
 */
export async function callTelegramApi<T>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/${method}`;

  try {
    const response = await axios.post<TelegramApiResponse<T>>(url, params, {
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });

    if (!response.data.ok) {
      throw new TelegramApiError(
        response.data.description || "Unknown Telegram API error",
        response.data.error_code,
        response.data.parameters?.retry_after
      );
    }

    return response.data.result as T;
  } catch (error) {
    if (error instanceof TelegramApiError) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      throw telegramErrorFromAxios(error);
    }
    throw new TelegramApiError(
      `Unexpected error calling Telegram API: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function telegramErrorFromAxios(error: AxiosError<TelegramApiResponse<unknown>>): TelegramApiError {
  const body = error.response?.data;
  if (body && typeof body === "object" && "description" in body) {
    return new TelegramApiError(
      body.description || "Telegram API request failed",
      body.error_code,
      body.parameters?.retry_after
    );
  }
  if (error.code === "ECONNABORTED") {
    return new TelegramApiError("Request to Telegram API timed out. Please try again.");
  }
  return new TelegramApiError(
    `Telegram API request failed: ${error.message}`
  );
}

/** Formats a TelegramApiError (or any error) into agent-actionable text. */
export function formatTelegramError(error: unknown): string {
  if (error instanceof TelegramApiError) {
    switch (error.errorCode) {
      case 400:
        return `Error: Bad request — ${error.message}. Check that chat_id, message_id, and other parameters are correct.`;
      case 401:
        return "Error: Unauthorized. TELEGRAM_BOT_TOKEN is invalid or revoked — generate a new one via @BotFather.";
      case 403:
        return `Error: Forbidden — ${error.message}. The bot may have been blocked by the user, kicked from the chat, or lacks the required admin rights.`;
      case 404:
        return `Error: Not found — ${error.message}. Check that the chat_id or message_id exists.`;
      case 429: {
        const wait = error.retryAfter ? ` Retry after ${error.retryAfter}s.` : "";
        return `Error: Rate limit exceeded (429).${wait}`;
      }
      default:
        return `Error: ${error.message}`;
    }
  }
  return `Error: Unexpected error occurred: ${
    error instanceof Error ? error.message : String(error)
  }`;
}
