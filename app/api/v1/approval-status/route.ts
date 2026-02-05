import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalRequests, approvalTokens, agents } from "@/lib/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { hashToken } from "@latchagent/shared";

/**
 * GET /api/v1/approval-status?approval_request_id=xxx
 * 
 * Check if an approval request has been approved and return the token if so.
 * Used by the CLI to poll for approval status.
 */
export async function GET(request: NextRequest) {
  const agentKey = request.headers.get("X-Latch-Agent-Key");
  if (!agentKey) {
    return NextResponse.json({ error: "Missing agent key" }, { status: 401 });
  }

  // Verify agent
  const keyHash = hashToken(agentKey);
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.clientKeyHash, keyHash));

  if (!agent) {
    return NextResponse.json({ error: "Invalid agent key" }, { status: 401 });
  }

  const approvalRequestId = request.nextUrl.searchParams.get("approval_request_id");
  if (!approvalRequestId) {
    return NextResponse.json({ error: "Missing approval_request_id" }, { status: 400 });
  }

  // Get the approval request
  const [approvalRequest] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.id, approvalRequestId),
        eq(approvalRequests.workspaceId, agent.workspaceId)
      )
    );

  if (!approvalRequest) {
    return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  }

  // Check status
  if (approvalRequest.status === "pending") {
    return NextResponse.json({
      status: "pending",
      expires_at: approvalRequest.expiresAt,
    });
  }

  if (approvalRequest.status === "denied") {
    return NextResponse.json({
      status: "denied",
    });
  }

  if (approvalRequest.status === "expired") {
    return NextResponse.json({
      status: "expired",
    });
  }

  if (approvalRequest.status === "approved") {
    // Check if token is available (not yet retrieved)
    const [tokenRecord] = await db
      .select()
      .from(approvalTokens)
      .where(
        and(
          eq(approvalTokens.approvalRequestId, approvalRequestId),
          isNotNull(approvalTokens.rawToken),
          isNull(approvalTokens.retrievedAt)
        )
      );

    if (tokenRecord && tokenRecord.rawToken) {
      // Mark as retrieved and return the token
      await db
        .update(approvalTokens)
        .set({ 
          retrievedAt: new Date(),
          rawToken: null, // Clear the raw token after retrieval
        })
        .where(eq(approvalTokens.id, tokenRecord.id));

      return NextResponse.json({
        status: "approved",
        token: tokenRecord.rawToken,
      });
    }

    // Token was already retrieved or not available
    return NextResponse.json({
      status: "approved",
      token_available: false,
      message: "Token already retrieved or not available",
    });
  }

  return NextResponse.json({
    status: approvalRequest.status,
  });
}
