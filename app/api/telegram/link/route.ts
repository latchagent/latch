import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";
import { generateTelegramLinkToken } from "@/lib/telegram/bot";

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    if (!botUsername) {
      return NextResponse.json(
        { error: "Telegram bot not configured" },
        { status: 500 }
      );
    }

    const token = await generateTelegramLinkToken(session.user.id);
    const url = `https://t.me/${botUsername}?start=${token}`;

    return NextResponse.json({ url, token });
  } catch (error) {
    console.error("Telegram link error:", error);
    return NextResponse.json(
      { error: "Failed to generate link" },
      { status: 500 }
    );
  }
}
