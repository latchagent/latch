import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { policyRules } from "@/lib/db/schema";
import { z } from "zod";

const createRuleSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().optional(),
  effect: z.enum(["allow", "deny", "require_approval"]),
  actionClass: z.enum([
    "read",
    "write",
    "send",
    "execute",
    "submit",
    "transfer_value",
    "any",
  ]),
  upstreamId: z.string().uuid().optional(),
  toolName: z.string().optional(),
  domainMatch: z.string().optional(),
  domainMatchType: z.enum(["exact", "suffix"]).optional(),
  recipientMatch: z.string().optional(), // Exact email address match
  priority: z.number().min(0).max(100).default(50),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createRuleSchema.parse(body);

    const isMember = await isWorkspaceMember(session.user.id, data.workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [rule] = await db
      .insert(policyRules)
      .values({
        workspaceId: data.workspaceId,
        name: data.name,
        effect: data.effect,
        actionClass: data.actionClass,
        upstreamId: data.upstreamId,
        toolName: data.toolName,
        domainMatch: data.domainMatch,
        domainMatchType: data.domainMatchType,
        recipientMatch: data.recipientMatch,
        priority: data.priority,
        enabled: true,
      })
      .returning();

    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Create rule error:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
