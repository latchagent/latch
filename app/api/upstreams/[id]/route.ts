import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { upstreams } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateUpstreamSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    transport: z.enum(["http", "stdio"]).optional(),

    // HTTP
    baseUrl: z.string().url().nullable().optional(),
    headers: z.record(z.string(), z.string()).nullable().optional(),
    authType: z.enum(["none", "bearer", "header"]).optional(),
    authValue: z.string().nullable().optional(),

    // stdio
    stdioCommand: z.string().min(1).nullable().optional(),
    stdioArgs: z.array(z.string()).nullable().optional(),
    stdioEnv: z.record(z.string(), z.string()).nullable().optional(),
    stdioCwd: z.string().nullable().optional(),
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const [upstream] = await db.select().from(upstreams).where(eq(upstreams.id, id));
    if (!upstream) return NextResponse.json({ error: "Upstream not found" }, { status: 404 });

    const isMember = await isWorkspaceMember(session.user.id, upstream.workspaceId);
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const data = updateUpstreamSchema.parse(body);

    const nextTransport = data.transport ?? upstream.transport;

    // Enforce required fields for the resulting transport.
    if (nextTransport === "http") {
      const nextBaseUrl =
        data.baseUrl === null ? null : data.baseUrl ?? upstream.baseUrl ?? null;
      if (!nextBaseUrl) {
        return NextResponse.json(
          { error: "baseUrl is required for HTTP upstreams" },
          { status: 400 }
        );
      }
    } else {
      const nextCmd =
        data.stdioCommand === null
          ? null
          : data.stdioCommand ?? upstream.stdioCommand ?? null;
      if (!nextCmd) {
        return NextResponse.json(
          { error: "stdioCommand is required for stdio upstreams" },
          { status: 400 }
        );
      }
    }

    const [updated] = await db
      .update(upstreams)
      .set({
        name: data.name ?? upstream.name,
        transport: nextTransport,

        baseUrl: nextTransport === "http" ? (data.baseUrl ?? upstream.baseUrl) : null,
        headers: nextTransport === "http" ? (data.headers ?? upstream.headers) : null,
        authType: nextTransport === "http" ? (data.authType ?? upstream.authType) : "none",
        authValue: nextTransport === "http" ? (data.authValue ?? upstream.authValue) : null,

        stdioCommand:
          nextTransport === "stdio"
            ? (data.stdioCommand ?? upstream.stdioCommand)
            : null,
        stdioArgs:
          nextTransport === "stdio"
            ? (data.stdioArgs ?? upstream.stdioArgs ?? [])
            : null,
        stdioEnv:
          nextTransport === "stdio"
            ? (data.stdioEnv ?? upstream.stdioEnv ?? {})
            : null,
        stdioCwd: nextTransport === "stdio" ? (data.stdioCwd ?? upstream.stdioCwd) : null,
      })
      .where(eq(upstreams.id, id))
      .returning();

    // Best-effort tool discovery refresh for HTTP upstreams after edits.
    if (updated.transport === "http" && updated.baseUrl) {
      const { listUpstreamTools } = await import("@/lib/proxy/upstream");
      const discovery = await listUpstreamTools(updated);
      const toolsUpdate =
        "error" in discovery
          ? { tools: null, toolsSyncedAt: null, toolsSyncError: discovery.error }
          : { tools: discovery.tools, toolsSyncedAt: new Date(), toolsSyncError: null };
      await db.update(upstreams).set(toolsUpdate).where(eq(upstreams.id, updated.id));
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Update upstream error:", error);
    return NextResponse.json({ error: "Failed to update upstream" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const [upstream] = await db.select().from(upstreams).where(eq(upstreams.id, id));
    if (!upstream) return NextResponse.json({ error: "Upstream not found" }, { status: 404 });

    const isMember = await isWorkspaceMember(session.user.id, upstream.workspaceId);
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db.delete(upstreams).where(eq(upstreams.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete upstream error:", error);
    return NextResponse.json({ error: "Failed to delete upstream" }, { status: 500 });
  }
}

