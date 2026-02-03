import { db } from "@/lib/db";
import {
  approvalRequests,
  approvalTokens,
  requests,
  policyLeases,
  type ApprovalRequest,
  type ApprovalToken,
  type Request,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateToken, hashToken } from "@/lib/utils/hash";

const DEFAULT_APPROVAL_EXPIRY_HOURS = 24;

export interface ApprovalRequestResult {
  approvalRequest: ApprovalRequest;
  request: Request;
}

/**
 * Create an approval request for a tool call
 */
export async function createApprovalRequest(
  requestId: string,
  workspaceId: string,
  agentId: string | null,
  expiryHours: number = DEFAULT_APPROVAL_EXPIRY_HOURS
): Promise<ApprovalRequest> {
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  const [approvalRequest] = await db
    .insert(approvalRequests)
    .values({
      workspaceId,
      agentId,
      requestId,
      status: "pending",
      expiresAt,
    })
    .returning();

  // Trigger Telegram notification asynchronously
  notifyTelegramAsync(approvalRequest.id);

  return approvalRequest;
}

/**
 * Trigger Telegram notification without blocking
 */
async function notifyTelegramAsync(approvalRequestId: string): Promise<void> {
  try {
    const { notifyApprovalRequired } = await import("@/lib/telegram/bot");
    await notifyApprovalRequired(approvalRequestId);
  } catch (error) {
    // Log but don't fail the request if Telegram notification fails
    console.error("Failed to send Telegram notification:", error);
  }
}

/**
 * Approve an approval request and generate a single-use token
 */
export async function approveRequest(
  approvalRequestId: string,
  userId: string,
  options?: {
    createLease?: boolean;
    leaseDurationMinutes?: number;
  }
): Promise<{ token: string; expiresAt: Date }> {
  // Get the approval request and associated request
  const [approvalRequest] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalRequestId));

  if (!approvalRequest) {
    throw new Error("Approval request not found");
  }

  if (approvalRequest.status !== "pending") {
    throw new Error(`Approval request is ${approvalRequest.status}`);
  }

  if (new Date(approvalRequest.expiresAt) < new Date()) {
    // Mark as expired
    await db
      .update(approvalRequests)
      .set({ status: "expired" })
      .where(eq(approvalRequests.id, approvalRequestId));
    throw new Error("Approval request has expired");
  }

  // Get the original request
  const [request] = await db
    .select()
    .from(requests)
    .where(eq(requests.id, approvalRequest.requestId));

  if (!request) {
    throw new Error("Original request not found");
  }

  // Generate approval token
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Create the token record (store rawToken for CLI auto-retry polling)
  await db.insert(approvalTokens).values({
    approvalRequestId,
    tokenHash,
    rawToken: token, // Stored for CLI polling, cleared after retrieval
    requestHash: request.requestHash,
    toolName: request.toolName,
    upstreamId: request.upstreamId,
    argsHash: request.argsHash,
    expiresAt: tokenExpiresAt,
  });

  // Update approval request status
  await db
    .update(approvalRequests)
    .set({
      status: "approved",
      approvedByUserId: userId,
      approvedAt: new Date(),
    })
    .where(eq(approvalRequests.id, approvalRequestId));

  // Optionally create a lease for future similar actions
  if (options?.createLease && options.leaseDurationMinutes) {
    await db.insert(policyLeases).values({
      workspaceId: request.workspaceId,
      createdByUserId: userId,
      actionClass: request.actionClass,
      upstreamId: request.upstreamId,
      toolName: request.toolName,
      expiresAt: new Date(Date.now() + options.leaseDurationMinutes * 60 * 1000),
    });
  }

  return { token, expiresAt: tokenExpiresAt };
}

/**
 * Deny an approval request
 */
export async function denyRequest(
  approvalRequestId: string,
  userId: string,
  options?: {
    createDenyRule?: boolean;
  }
): Promise<void> {
  const [approvalRequest] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalRequestId));

  if (!approvalRequest) {
    throw new Error("Approval request not found");
  }

  if (approvalRequest.status !== "pending") {
    throw new Error(`Approval request is ${approvalRequest.status}`);
  }

  // Update approval request status
  await db
    .update(approvalRequests)
    .set({
      status: "denied",
      deniedByUserId: userId,
      deniedAt: new Date(),
    })
    .where(eq(approvalRequests.id, approvalRequestId));

  // Optionally create a deny rule for future similar actions
  if (options?.createDenyRule) {
    const [request] = await db
      .select()
      .from(requests)
      .where(eq(requests.id, approvalRequest.requestId));

    if (request) {
      const { createDenyRule } = await import("./policy-engine");
      await createDenyRule(request.workspaceId, request.actionClass, {
        upstreamId: request.upstreamId,
        toolName: request.toolName,
      });
    }
  }
}

export interface TokenValidationResult {
  valid: boolean;
  error?: string;
  token?: ApprovalToken;
}

/**
 * Validate an approval token
 *
 * SECURITY CRITICAL: Must validate:
 * - token approved
 * - token not expired
 * - token not consumed
 * - request_hash + tool_name + upstream_id + args_hash match original
 */
export async function validateApprovalToken(
  rawToken: string,
  toolName: string,
  upstreamId: string,
  argsHash: string,
  requestHash: string
): Promise<TokenValidationResult> {
  const tokenHash = hashToken(rawToken);

  // Find the token
  const [token] = await db
    .select()
    .from(approvalTokens)
    .where(eq(approvalTokens.tokenHash, tokenHash));

  if (!token) {
    return { valid: false, error: "Invalid approval token" };
  }

  // Check if already consumed
  if (token.consumedAt) {
    return { valid: false, error: "Approval token already used" };
  }

  // Check expiration
  if (new Date(token.expiresAt) < new Date()) {
    return { valid: false, error: "Approval token expired" };
  }

  // CRITICAL: Validate binding
  if (token.toolName !== toolName) {
    return {
      valid: false,
      error: `Token binding mismatch: tool_name (expected ${token.toolName}, got ${toolName})`,
    };
  }

  if (token.upstreamId !== upstreamId) {
    return {
      valid: false,
      error: "Token binding mismatch: upstream_id",
    };
  }

  if (token.argsHash !== argsHash) {
    return {
      valid: false,
      error: "Token binding mismatch: args_hash (arguments changed)",
    };
  }

  if (token.requestHash !== requestHash) {
    return {
      valid: false,
      error: "Token binding mismatch: request_hash",
    };
  }

  return { valid: true, token };
}

/**
 * Consume an approval token (mark as used)
 */
export async function consumeToken(tokenId: string): Promise<void> {
  await db
    .update(approvalTokens)
    .set({ consumedAt: new Date() })
    .where(eq(approvalTokens.id, tokenId));
}

/**
 * Get pending approval requests for a workspace
 */
export async function getPendingApprovals(
  workspaceId: string
): Promise<ApprovalRequestResult[]> {
  const results = await db
    .select({
      approvalRequest: approvalRequests,
      request: requests,
    })
    .from(approvalRequests)
    .innerJoin(requests, eq(approvalRequests.requestId, requests.id))
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.status, "pending")
      )
    )
    .orderBy(approvalRequests.createdAt);

  return results;
}

/**
 * Get approval request by ID with full details
 */
export async function getApprovalRequestWithDetails(
  approvalRequestId: string
): Promise<ApprovalRequestResult | null> {
  const [result] = await db
    .select({
      approvalRequest: approvalRequests,
      request: requests,
    })
    .from(approvalRequests)
    .innerJoin(requests, eq(approvalRequests.requestId, requests.id))
    .where(eq(approvalRequests.id, approvalRequestId));

  return result || null;
}
