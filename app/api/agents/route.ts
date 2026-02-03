import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/utils/hash";
import { z } from "zod";

const createAgentSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, name } = createAgentSchema.parse(body);

    const isMember = await isWorkspaceMember(session.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate client key
    const clientKey = generateToken(32);
    const clientKeyHash = hashToken(clientKey);

    const [agent] = await db
      .insert(agents)
      .values({
        workspaceId,
        name,
        clientKeyHash,
      })
      .returning();

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name,
        createdAt: agent.createdAt,
      },
      clientKey, // Only returned once!
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Create agent error:", error);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
