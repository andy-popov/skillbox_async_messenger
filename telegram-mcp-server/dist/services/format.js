import { CHARACTER_LIMIT } from "../constants.js";
/** Truncates a JSON-serialized payload so responses stay within CHARACTER_LIMIT. */
export function truncateJson(payload) {
    const full = JSON.stringify(payload, null, 2);
    if (full.length <= CHARACTER_LIMIT)
        return full;
    if (Array.isArray(payload)) {
        const half = Math.max(1, Math.floor(payload.length / 2));
        return JSON.stringify({
            items: payload.slice(0, half),
            truncated: true,
            truncation_message: `Response truncated from ${payload.length} to ${half} items. Narrow your query (e.g. lower 'limit') to see more.`,
        }, null, 2);
    }
    return full.slice(0, CHARACTER_LIMIT) + "\n... (truncated)";
}
export function formatUserLine(user) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    const handle = user.username ? ` (@${user.username})` : "";
    return `${name}${handle} [id: ${user.id}]`;
}
export function formatChatLine(chat) {
    const label = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ") ?? chat.username ?? String(chat.id);
    return `${label} [${chat.type}, id: ${chat.id}]`;
}
export function formatMessageMarkdown(message) {
    const lines = [
        `## Message ${message.message_id}`,
        `- **Chat**: ${formatChatLine(message.chat)}`,
    ];
    if (message.from)
        lines.push(`- **From**: ${formatUserLine(message.from)}`);
    lines.push(`- **Date**: ${new Date(message.date * 1000).toISOString()}`);
    if (message.text)
        lines.push(`- **Text**: ${message.text}`);
    if (message.caption)
        lines.push(`- **Caption**: ${message.caption}`);
    return lines.join("\n");
}
//# sourceMappingURL=format.js.map