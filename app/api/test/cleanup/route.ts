import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  workspaces,
  workspaceMembers,
  agents,
  upstreams,
  policyRules,
  policyLeases,
  requests,
  approvalRequests,
  approvalTokens,
} from "@/lib/db/schema";
import { user } from "@/lib/db/auth-schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/test/cleanup
 *
 * Test-only endpoint to clean up test data.
 */

const TEST_SECRET = process.env.TEST_SECRET || "test-secret-for-local-dev";

export async function POST(request: NextRequest) {
  // Security check
  const authHeader = request.headers.get("Authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");

  if (process.env.NODE_ENV === "production" && providedSecret !== TEST_SECRET) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Delete in order (respecting foreign keys)
    await db.delete(approvalTokens).where(
      eq(
        approvalTokens.approvalRequestId,
        db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(eq(approvalRequests.workspaceId, workspaceId))
      )
    );
    await db.delete(approvalRequests).where(eq(approvalRequests.workspaceId, workspaceId));
    await db.delete(requests).where(eq(requests.workspaceId, workspaceId));
    await db.delete(policyLeases).where(eq(policyLeases.workspaceId, workspaceId));
    await db.delete(policyRules).where(eq(policyRules.workspaceId, workspaceId));
    await db.delete(agents).where(eq(agents.workspaceId, workspaceId));
    await db.delete(upstreams).where(eq(upstreams.workspaceId, workspaceId));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    // Optionally delete test user
    const { deleteUser } = body;
    if (deleteUser) {
      await db.delete(user).where(eq(user.email, "test@latch.dev"));
    }

    return NextResponse.json({
      success: true,
      deleted: { workspaceId },
    });
  } catch (error) {
    console.error("Test cleanup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cleanup failed" },
      { status: 500 }
    );
  }
}
