import { db } from "@/lib/db";
import {
  telegramLinks,
  telegramLinkTokens,
  approvalRequests,
  requests,
  workspaceMembers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateToken } from "@/lib/utils/hash";

const TELEGRAM_API = "https://api.telegram.org/bot";

/**
 * Get the Telegram bot token from environment
 */
function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  return token;
}

/**
 * Send a message via Telegram
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    replyMarkup?: unknown;
  }
): Promise<{ ok: boolean; result?: { message_id: number } }> {
  const token = getBotToken();

  const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || "HTML",
      reply_markup: options?.replyMarkup,
    }),
  });

  return response.json();
}

/**
 * Edit a message via Telegram
 */
export async function editTelegramMessage(
  chatId: string,
  messageId: string,
  text: string,
  options?: {
    parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    replyMarkup?: unknown;
  }
): Promise<{ ok: boolean }> {
  const token = getBotToken();

  const response = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parseMode || "HTML",
      reply_markup: options?.replyMarkup,
    }),
  });

  return response.json();
}

/**
 * Answer a callback query
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<{ ok: boolean }> {
  const token = getBotToken();

  const response = await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });

  return response.json();
}

/**
 * Generate a link token for connecting Telegram
 */
export async function generateTelegramLinkToken(userId: string): Promise<string> {
  const token = generateToken(16);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.insert(telegramLinkTokens).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

/**
 * Link a Telegram chat to a user
 */
export async function linkTelegramChat(
  token: string,
  chatId: string,
  username?: string,
  firstName?: string
): Promise<{ success: boolean; error?: string }> {
  // Find and validate token
  const [linkToken] = await db
    .select()
    .from(telegramLinkTokens)
    .where(eq(telegramLinkTokens.token, token));

  if (!linkToken) {
    return { success: false, error: "Invalid link token" };
  }

  if (linkToken.usedAt) {
    return { success: false, error: "Token already used" };
  }

  if (new Date(linkToken.expiresAt) < new Date()) {
    return { success: false, error: "Token expired" };
  }

  // Mark token as used
  await db
    .update(telegramLinkTokens)
    .set({ usedAt: new Date() })
    .where(eq(telegramLinkTokens.id, linkToken.id));

  // Create or update telegram link
  await db
    .insert(telegramLinks)
    .values({
      userId: linkToken.userId,
      chatId,
      username,
      firstName,
      verified: true,
    })
    .onConflictDoUpdate({
      target: telegramLinks.userId,
      set: {
        chatId,
        username,
        firstName,
        verified: true,
      },
    });

  return { success: true };
}

/**
 * Get Telegram link for a user
 */
export async function getTelegramLink(userId: string) {
  const [link] = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId));
  return link || null;
}

/**
 * Get all workspace members' Telegram chat IDs
 */
export async function getWorkspaceTelegramChats(workspaceId: string): Promise<string[]> {
  const members = await db
    .select({
      chatId: telegramLinks.chatId,
    })
    .from(workspaceMembers)
    .innerJoin(telegramLinks, eq(workspaceMembers.userId, telegramLinks.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(telegramLinks.verified, true)
      )
    );

  return members.map((m) => m.chatId);
}

/**
 * Format an approval request for Telegram
 */
function formatApprovalMessage(
  request: typeof requests.$inferSelect,
  approvalId: string
): string {
  const riskEmoji = {
    low: "🟢",
    med: "🟡",
    high: "🟠",
    critical: "🔴",
  };

  const actionEmoji = {
    read: "📖",
    write: "✏️",
    send: "📤",
    execute: "⚡",
    submit: "📝",
    transfer_value: "💰",
  };

  const emoji = actionEmoji[request.actionClass as keyof typeof actionEmoji] || "🔧";
  const risk = riskEmoji[request.riskLevel as keyof typeof riskEmoji] || "⚪";

  let message = `${emoji} <b>Approval Required</b>\n\n`;
  message += `<b>Tool:</b> <code>${escapeHtml(request.toolName)}</code>\n`;
  message += `<b>Action:</b> ${request.actionClass.toUpperCase()}\n`;
  message += `<b>Risk:</b> ${risk} ${request.riskLevel.toUpperCase()}\n`;

  if (request.resource) {
    const res = request.resource as { domain?: string; urlHost?: string };
    if (res.domain) {
      message += `<b>Domain:</b> ${escapeHtml(res.domain)}\n`;
    }
    if (res.urlHost) {
      message += `<b>Host:</b> ${escapeHtml(res.urlHost)}\n`;
    }
  }

  if (request.riskFlags) {
    const flags = Object.entries(request.riskFlags)
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/_/g, " "));
    if (flags.length > 0) {
      message += `<b>Flags:</b> ${flags.join(", ")}\n`;
    }
  }

  message += `\n<i>ID: ${approvalId.slice(0, 8)}</i>`;

  return message;
}

/**
 * Escape HTML for Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Send an approval request notification to workspace members
 */
export async function notifyApprovalRequired(
  approvalRequestId: string
): Promise<void> {
  // Get the approval request with related request
  const [approval] = await db
    .select({
      approval: approvalRequests,
      request: requests,
    })
    .from(approvalRequests)
    .innerJoin(requests, eq(approvalRequests.requestId, requests.id))
    .where(eq(approvalRequests.id, approvalRequestId));

  if (!approval) return;

  // Get workspace members' Telegram chats
  const chatIds = await getWorkspaceTelegramChats(approval.approval.workspaceId);

  if (chatIds.length === 0) return;

  const message = formatApprovalMessage(approval.request, approvalRequestId);

  // Create inline keyboard with approve/deny buttons
  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `approve:${approvalRequestId}` },
        { text: "❌ Deny", callback_data: `deny:${approvalRequestId}` },
      ],
      [
        { text: "✅ Approve 15min", callback_data: `approve_15:${approvalRequestId}` },
        { text: "✅ Approve 1hr", callback_data: `approve_60:${approvalRequestId}` },
      ],
    ],
  };

  // Send to all members
  for (const chatId of chatIds) {
    try {
      const result = await sendTelegramMessage(chatId, message, {
        parseMode: "HTML",
        replyMarkup: keyboard,
      });

      // Store the message ID for later updates
      if (result.ok && result.result) {
        await db
          .update(approvalRequests)
          .set({ telegramMessageId: `${chatId}:${result.result.message_id}` })
          .where(eq(approvalRequests.id, approvalRequestId));
      }
    } catch (error) {
      console.error(`Failed to send Telegram notification to ${chatId}:`, error);
    }
  }
}

/**
 * Update Telegram message after approval/denial
 */
export async function updateApprovalMessage(
  approvalRequestId: string,
  status: "approved" | "denied",
  userName?: string
): Promise<void> {
  const [approval] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalRequestId));

  if (!approval?.telegramMessageId) return;

  const [chatId, messageId] = approval.telegramMessageId.split(":");

  const statusEmoji = status === "approved" ? "✅" : "❌";
  const statusText = status === "approved" ? "APPROVED" : "DENIED";

  const message = `${statusEmoji} <b>${statusText}</b>${userName ? ` by ${escapeHtml(userName)}` : ""}\n\n<i>Request ID: ${approvalRequestId.slice(0, 8)}</i>`;

  try {
    await editTelegramMessage(chatId, messageId, message, { parseMode: "HTML" });
  } catch (error) {
    console.error("Failed to update Telegram message:", error);
  }
}
