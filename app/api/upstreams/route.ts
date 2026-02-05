import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { upstreams } from "@/lib/db/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";

const createUpstreamSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  transport: z.enum(["http", "stdio"]).default("http"),

  // HTTP upstream
  baseUrl: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  authType: z.enum(["none", "bearer", "header"]).default("none"),
  authValue: z.string().optional(),

  // Stdio upstream
  stdioCommand: z.string().min(1).optional(),
  stdioArgs: z.array(z.string()).optional(),
  stdioEnv: z.record(z.string(), z.string()).optional(),
  stdioCwd: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.transport === "http") {
    if (!data.baseUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "baseUrl is required for HTTP upstreams",
      });
    }
  } else {
    if (!data.stdioCommand) {
      ctx.addIssue({
        code: "custom",
        path: ["stdioCommand"],
        message: "stdioCommand is required for stdio upstreams",
      });
    }
  }
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
        transport: data.transport,
        baseUrl: data.transport === "http" ? data.baseUrl : null,
        headers: data.transport === "http" ? data.headers : null,
        authType: data.transport === "http" ? data.authType : "none",
        authValue: data.transport === "http" ? data.authValue : null,
        stdioCommand: data.transport === "stdio" ? data.stdioCommand : null,
        stdioArgs: data.transport === "stdio" ? (data.stdioArgs ?? []) : null,
        stdioEnv: data.transport === "stdio" ? (data.stdioEnv ?? {}) : null,
        stdioCwd: data.transport === "stdio" ? data.stdioCwd : null,
      })
      .returning();

    // Tool discovery (HTTP only) - best effort.
    if (upstream.transport === "http" && upstream.baseUrl) {
      const { listUpstreamTools } = await import("@/lib/proxy/upstream");
      const discovery = await listUpstreamTools(upstream);

      const update =
        "error" in discovery
          ? { tools: null, toolsSyncedAt: null, toolsSyncError: discovery.error }
          : { tools: discovery.tools, toolsSyncedAt: new Date(), toolsSyncError: null };

      await db.update(upstreams).set(update).where(eq(upstreams.id, upstream.id));
    }

    return NextResponse.json({
      id: upstream.id,
      name: upstream.name,
      transport: upstream.transport,
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
