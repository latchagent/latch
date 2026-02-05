import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, upstreams } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { hashToken } from "@latchagent/shared";

const syncToolsSchema = z.object({
  workspace_id: z.string().uuid(),
  agent_key: z.string().min(1),
  upstream_id: z.string().uuid(),
  tools: z.array(z.unknown()),
});

export async function POST(request: NextRequest) {
  try {
    const agentKeyHeader = request.headers.get("X-Latch-Agent-Key");
    if (!agentKeyHeader) {
      return NextResponse.json(
        { error: "Missing X-Latch-Agent-Key header" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const input = syncToolsSchema.parse(body);

    if (input.agent_key !== agentKeyHeader) {
      return NextResponse.json({ error: "Agent key mismatch" }, { status: 401 });
    }

    const keyHash = hashToken(input.agent_key);
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(eq(agents.workspaceId, input.workspace_id), eq(agents.clientKeyHash, keyHash))
      );

    if (!agent) {
      return NextResponse.json({ error: "Invalid agent key" }, { status: 401 });
    }

    const [upstream] = await db
      .select()
      .from(upstreams)
      .where(
        and(eq(upstreams.id, input.upstream_id), eq(upstreams.workspaceId, input.workspace_id))
      );

    if (!upstream) {
      return NextResponse.json({ error: "Upstream not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(upstreams)
      .set({
        tools: input.tools,
        toolsSyncedAt: new Date(),
        toolsSyncError: null,
      })
      .where(eq(upstreams.id, upstream.id))
      .returning();

    return NextResponse.json({
      ok: true,
      toolsCount: Array.isArray(updated.tools) ? updated.tools.length : 0,
      toolsSyncedAt: updated.toolsSyncedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Sync upstream tools (v1) error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

