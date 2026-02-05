import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalRequests, approvalTokens, requests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSecureToken, hashToken } from "@latchagent/shared";

/**
 * POST /api/test/approve
 *
 * Test-only endpoint to approve a pending approval request and get the token.
 * Used by the test harness to complete the approval flow programmatically.
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
    const { approvalRequestId } = body;

    if (!approvalRequestId) {
      return NextResponse.json(
        { error: "approvalRequestId is required" },
        { status: 400 }
      );
    }

    // Get the approval request
    const [approvalRequest] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalRequestId));

    if (!approvalRequest) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 }
      );
    }

    if (approvalRequest.status !== "pending") {
      return NextResponse.json(
        { error: `Approval request is ${approvalRequest.status}, not pending` },
        { status: 400 }
      );
    }

    // Get the original request for token binding
    const [originalRequest] = await db
      .select()
      .from(requests)
      .where(eq(requests.id, approvalRequest.requestId));

    if (!originalRequest) {
      return NextResponse.json(
        { error: "Original request not found" },
        { status: 404 }
      );
    }

    // Generate token
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Create approval token
    await db.insert(approvalTokens).values({
      approvalRequestId: approvalRequest.id,
      tokenHash,
      requestHash: originalRequest.requestHash,
      toolName: originalRequest.toolName,
      upstreamId: originalRequest.upstreamId,
      argsHash: originalRequest.argsHash,
      expiresAt,
    });

    // Update approval request status
    await db
      .update(approvalRequests)
      .set({
        status: "approved",
        approvedAt: new Date(),
      })
      .where(eq(approvalRequests.id, approvalRequestId));

    return NextResponse.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      binding: {
        requestHash: originalRequest.requestHash,
        toolName: originalRequest.toolName,
        upstreamId: originalRequest.upstreamId,
        argsHash: originalRequest.argsHash,
      },
    });
  } catch (error) {
    console.error("Test approve error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      { status: 500 }
    );
  }
}
