import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { policyRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateRuleSchema = z.object({
  name: z.string().optional(),
  effect: z.enum(["allow", "deny", "require_approval"]).optional(),
  actionClass: z.enum([
    "read", "write", "send", "execute", "submit", "transfer_value", "any"
  ]).optional(),
  toolName: z.string().nullable().optional(),
  domainMatch: z.string().nullable().optional(),
  domainMatchType: z.enum(["exact", "suffix"]).optional(),
  priority: z.number().min(0).max(100).optional(),
  enabled: z.boolean().optional(),
  smartCondition: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get the rule to verify workspace membership
    const [rule] = await db
      .select()
      .from(policyRules)
      .where(eq(policyRules.id, id));

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const isMember = await isWorkspaceMember(session.user.id, rule.workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = updateRuleSchema.parse(body);

    const [updated] = await db
      .update(policyRules)
      .set({
        ...data,
        // Handle null vs undefined for optional fields
        toolName: data.toolName === null ? null : data.toolName ?? rule.toolName,
        domainMatch: data.domainMatch === null ? null : data.domainMatch ?? rule.domainMatch,
        smartCondition: data.smartCondition === null ? null : data.smartCondition ?? rule.smartCondition,
      })
      .where(eq(policyRules.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Update rule error:", error);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get the rule to verify workspace membership
    const [rule] = await db
      .select()
      .from(policyRules)
      .where(eq(policyRules.id, id));

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const isMember = await isWorkspaceMember(session.user.id, rule.workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(policyRules).where(eq(policyRules.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete rule error:", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
