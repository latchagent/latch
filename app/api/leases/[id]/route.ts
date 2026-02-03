import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { policyLeases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    // Get the lease to verify workspace membership
    const [lease] = await db
      .select()
      .from(policyLeases)
      .where(eq(policyLeases.id, id));

    if (!lease) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
    }

    const isMember = await isWorkspaceMember(session.user.id, lease.workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(policyLeases).where(eq(policyLeases.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete lease error:", error);
    return NextResponse.json({ error: "Failed to delete lease" }, { status: 500 });
  }
}
