import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const isMember = await isWorkspaceMember(session.user.id, agent.workspaceId);
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db.delete(agents).where(eq(agents.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete agent error:", error);
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
  }
}

