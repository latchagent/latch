import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { upstreams } from "@/lib/db/schema";
import { z } from "zod";

const createUpstreamSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  authType: z.enum(["none", "bearer", "header"]).default("none"),
  authValue: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createUpstreamSchema.parse(body);

    const isMember = await isWorkspaceMember(session.user.id, data.workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [upstream] = await db
      .insert(upstreams)
      .values({
        workspaceId: data.workspaceId,
        name: data.name,
        baseUrl: data.baseUrl,
        authType: data.authType,
        authValue: data.authValue,
      })
      .returning();

    return NextResponse.json({
      id: upstream.id,
      name: upstream.name,
      baseUrl: upstream.baseUrl,
      authType: upstream.authType,
      createdAt: upstream.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Create upstream error:", error);
    return NextResponse.json({ error: "Failed to create upstream" }, { status: 500 });
  }
}
