import { NextRequest, NextResponse } from "next/server";
import { getServerSession, isWorkspaceMember } from "@/lib/auth/server";
import { approveRequest, getApprovalRequestWithDetails } from "@/lib/proxy/approvals";
import { updateApprovalMessage } from "@/lib/telegram/bot";
import { z } from "zod";

const approveSchema = z.object({
  approvalId: z.string().uuid(),
  createLease: z.boolean().optional(),
  leaseDurationMinutes: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { approvalId, createLease, leaseDurationMinutes } = approveSchema.parse(body);

    // Get approval request to verify workspace membership
    const approval = await getApprovalRequestWithDetails(approvalId);
    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const isMember = await isWorkspaceMember(
      session.user.id,
      approval.approvalRequest.workspaceId
    );
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await approveRequest(approvalId, session.user.id, {
      createLease,
      leaseDurationMinutes,
    });

    // Update Telegram message
    try {
      await updateApprovalMessage(approvalId, "approved", session.user.name);
    } catch {
      // Ignore Telegram errors
    }

    return NextResponse.json({
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Approve error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve" },
      { status: 500 }
    );
  }
}
