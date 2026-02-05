import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { upstreams } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { listUpstreamTools } from "@/lib/proxy/upstream";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const [upstream] = await db.select().from(upstreams).where(eq(upstreams.id, id));
    if (!upstream) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isMember = await isWorkspaceMember(session.user.id, upstream.workspaceId);
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (upstream.transport !== "http" || !upstream.baseUrl) {
      return NextResponse.json(
        { error: "Tool sync is only supported for HTTP upstreams" },
        { status: 400 }
      );
    }

    const discovery = await listUpstreamTools(upstream);
    const update =
      "error" in discovery
        ? { tools: null, toolsSyncedAt: null, toolsSyncError: discovery.error }
        : { tools: discovery.tools, toolsSyncedAt: new Date(), toolsSyncError: null };

    const [updated] = await db
      .update(upstreams)
      .set(update)
      .where(and(eq(upstreams.id, upstream.id), eq(upstreams.workspaceId, upstream.workspaceId)))
      .returning();

    return NextResponse.json({
      ok: true,
      toolsCount: Array.isArray(updated.tools) ? updated.tools.length : 0,
      toolsSyncedAt: updated.toolsSyncedAt,
      toolsSyncError: updated.toolsSyncError,
    });
  } catch (error) {
    console.error("Sync upstream tools error:", error);
    return NextResponse.json({ error: "Failed to sync tools" }, { status: 500 });
  }
}

