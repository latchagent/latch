import { NextRequest, NextResponse } from "next/server";
import {
  linkTelegramChat,
  answerCallbackQuery,
  sendTelegramMessage,
  updateApprovalMessage,
} from "@/lib/telegram/bot";
import { approveRequest, denyRequest } from "@/lib/proxy/approvals";
import { db } from "@/lib/db";
import { approvalRequests, workspaceMembers, telegramLinks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    chat: {
      id: number;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    message?: {
      chat: {
        id: number;
      };
    };
    data?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    // Handle /start command with link token
    if (update.message?.text?.startsWith("/start ")) {
      const token = update.message.text.replace("/start ", "").trim();
      const chatId = update.message.chat.id.toString();

      const result = await linkTelegramChat(
        token,
        chatId,
        update.message.from.username,
        update.message.from.first_name
      );

      if (result.success) {
        await sendTelegramMessage(
          chatId,
          "✅ <b>Account linked successfully!</b>\n\nYou'll now receive approval requests here.",
          { parseMode: "HTML" }
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `❌ <b>Link failed:</b> ${result.error}`,
          { parseMode: "HTML" }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Handle /start without token
    if (update.message?.text === "/start") {
      await sendTelegramMessage(
        update.message.chat.id.toString(),
        "👋 <b>Welcome to Latch!</b>\n\nTo link your account, go to the Latch dashboard and click 'Connect Telegram'. You'll receive a link to paste here.",
        { parseMode: "HTML" }
      );
      return NextResponse.json({ ok: true });
    }

    // Handle callback queries (button presses)
    if (update.callback_query?.data) {
      const [action, approvalId] = update.callback_query.data.split(":");
      const chatId = update.callback_query.message?.chat.id.toString();

      if (!chatId) {
        await answerCallbackQuery(update.callback_query.id, "Error: No chat context");
        return NextResponse.json({ ok: true });
      }

      // Find the user by their Telegram chat ID
      const [link] = await db
        .select()
        .from(telegramLinks)
        .where(eq(telegramLinks.chatId, chatId));

      if (!link) {
        await answerCallbackQuery(
          update.callback_query.id,
          "Your Telegram is not linked to a Latch account"
        );
        return NextResponse.json({ ok: true });
      }

      // Get the approval request
      const [approval] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, approvalId));

      if (!approval) {
        await answerCallbackQuery(update.callback_query.id, "Approval request not found");
        return NextResponse.json({ ok: true });
      }

      if (approval.status !== "pending") {
        await answerCallbackQuery(
          update.callback_query.id,
          `Already ${approval.status}`
        );
        return NextResponse.json({ ok: true });
      }

      // Verify user is a workspace member
      const [member] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, approval.workspaceId),
            eq(workspaceMembers.userId, link.userId)
          )
        );

      if (!member) {
        await answerCallbackQuery(
          update.callback_query.id,
          "You're not a member of this workspace"
        );
        return NextResponse.json({ ok: true });
      }

      try {
        if (action === "approve" || action.startsWith("approve_")) {
          // Parse lease duration if present
          let leaseDuration: number | undefined;
          if (action === "approve_15") {
            leaseDuration = 15;
          } else if (action === "approve_60") {
            leaseDuration = 60;
          }

          const result = await approveRequest(approvalId, link.userId, {
            createLease: !!leaseDuration,
            leaseDurationMinutes: leaseDuration,
          });

          await answerCallbackQuery(update.callback_query.id, "✅ Approved!");

          // Update the message
          await updateApprovalMessage(
            approvalId,
            "approved",
            link.firstName || link.username || undefined
          );

          // Send the token to the chat
          await sendTelegramMessage(
            chatId,
            `🔑 <b>Approval Token</b>\n\n<code>${result.token}</code>\n\n<i>This token expires at ${result.expiresAt.toISOString()}</i>`,
            { parseMode: "HTML" }
          );
        } else if (action === "deny") {
          await denyRequest(approvalId, link.userId);

          await answerCallbackQuery(update.callback_query.id, "❌ Denied");

          await updateApprovalMessage(
            approvalId,
            "denied",
            link.firstName || link.username || undefined
          );
        }
      } catch (error) {
        console.error("Approval action error:", error);
        await answerCallbackQuery(
          update.callback_query.id,
          error instanceof Error ? error.message : "Action failed"
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
