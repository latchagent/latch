import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { telegramLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .delete(telegramLinks)
      .where(eq(telegramLinks.userId, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Telegram unlink error:", error);
    return NextResponse.json(
      { error: "Failed to unlink Telegram" },
      { status: 500 }
    );
  }
}
