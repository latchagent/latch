import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  agents,
  requests,
  approvalRequests,
  approvalTokens,
  policyRules,
  policyLeases,
} from "@/lib/db/schema";
import { eq, and, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import { hashToken } from "@latch/shared";

/**
 * POST /api/v1/authorize
 *
 * The single entry point for CLI authorization.
 * Handles both fresh requests and retry-with-token in one atomic operation.
 *
 * Flow:
 * 1. Authenticate agent via X-Latch-Agent-Key header
 * 2. If approval_token present: validate + consume atomically
 * 3. Otherwise: evaluate policy, create approval request if needed
 * 4. Log request to audit trail
 * 5. Return decision
 */

const authorizeSchema = z.object({
  workspace_id: z.string().uuid(),
  agent_key: z.string().min(1),
  upstream_id: z.string().uuid(),
  tool_name: z.string().min(1),
  action_class: z.enum([
    "read",
    "write",
    "send",
    "execute",
    "submit",
    "transfer_value",
  ]),
  risk_level: z.enum(["low", "med", "high", "critical"]),
  risk_flags: z.object({
    external_domain: z.boolean(),
    new_recipient: z.boolean(),
    attachment: z.boolean(),
    form_submit: z.boolean(),
    shell_exec: z.boolean(),
    destructive: z.boolean(),
  }),
  resource: z.object({
    domain: z.string().optional(),
    recipientDomain: z.string().optional(),
    recipient: z.string().optional(), // Full email address
    to: z.string().optional(), // Alias for recipient
    urlHost: z.string().optional(),
    urlPath: z.string().optional(),
  }),
  args_hash: z.string().min(1),
  request_hash: z.string().min(1),
  args_redacted: z.record(z.string(), z.unknown()),
  approval_token: z.string().optional(),
});

type AuthorizeInput = z.infer<typeof authorizeSchema>;

export async function POST(request: NextRequest) {
  try {
    // Get agent key from header
    const agentKeyHeader = request.headers.get("X-Latch-Agent-Key");
    if (!agentKeyHeader) {
      return NextResponse.json(
        { error: "Missing X-Latch-Agent-Key header" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const input = authorizeSchema.parse(body);

    // Verify agent key matches
    if (input.agent_key !== agentKeyHeader) {
      return NextResponse.json(
        { error: "Agent key mismatch" },
        { status: 401 }
      );
    }

    // Authenticate agent
    const keyHash = hashToken(input.agent_key);
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, input.workspace_id),
          eq(agents.clientKeyHash, keyHash)
        )
      );

    if (!agent) {
      return NextResponse.json(
        { error: "Invalid agent key" },
        { status: 401 }
      );
    }

    // Update agent last_seen_at
    await db
      .update(agents)
      .set({ lastSeenAt: new Date() })
      .where(eq(agents.id, agent.id));

    // If approval token present, validate and consume atomically
    if (input.approval_token) {
      return handleTokenRetry(input, agent.id);
    }

    // Otherwise, evaluate policy
    return handleFreshRequest(input, agent.id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Authorize error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Handle a retry with approval token
 * Validates and consumes token atomically
 */
async function handleTokenRetry(
  input: AuthorizeInput,
  agentId: string
): Promise<NextResponse> {
  const tokenHash = hashToken(input.approval_token!);

  // Find and validate token in one query
  const [token] = await db
    .select()
    .from(approvalTokens)
    .where(eq(approvalTokens.tokenHash, tokenHash));

  if (!token) {
    return logAndRespond(input, agentId, "denied", "Invalid approval token");
  }

  if (token.consumedAt) {
    return logAndRespond(input, agentId, "denied", "Approval token already used");
  }

  if (new Date(token.expiresAt) < new Date()) {
    return logAndRespond(input, agentId, "denied", "Approval token expired");
  }

  // CRITICAL: Validate token binding
  if (token.toolName !== input.tool_name) {
    return logAndRespond(
      input,
      agentId,
      "denied",
      `Token binding mismatch: tool_name (expected ${token.toolName})`
    );
  }

  if (token.upstreamId !== input.upstream_id) {
    return logAndRespond(input, agentId, "denied", "Token binding mismatch: upstream_id");
  }

  if (token.argsHash !== input.args_hash) {
    return logAndRespond(
      input,
      agentId,
      "denied",
      "Token binding mismatch: args_hash (arguments changed)"
    );
  }

  if (token.requestHash !== input.request_hash) {
    return logAndRespond(input, agentId, "denied", "Token binding mismatch: request_hash");
  }

  // Consume token atomically
  const [updated] = await db
    .update(approvalTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(approvalTokens.id, token.id),
        isNull(approvalTokens.consumedAt) // Only if not already consumed
      )
    )
    .returning();

  if (!updated) {
    // Race condition - token was consumed by another request
    return logAndRespond(input, agentId, "denied", "Approval token already used (race)");
  }

  // Token valid and consumed - allow the request
  return logAndRespond(input, agentId, "allowed", "Approved via token");
}

/**
 * Handle a fresh request (no approval token)
 * Evaluates policy and creates approval request if needed
 */
async function handleFreshRequest(
  input: AuthorizeInput,
  agentId: string
): Promise<NextResponse> {
  // Fetch rules and leases for the workspace
  const [rules, leases] = await Promise.all([
    db
      .select()
      .from(policyRules)
      .where(
        and(
          eq(policyRules.workspaceId, input.workspace_id),
          eq(policyRules.enabled, true)
        )
      )
      .orderBy(policyRules.priority),
    db
      .select()
      .from(policyLeases)
      .where(
        and(
          eq(policyLeases.workspaceId, input.workspace_id),
          gte(policyLeases.expiresAt, new Date())
        )
      ),
  ]);

  // Evaluate policy
  const decision = evaluatePolicy(input, rules, leases);

  if (decision.decision === "allowed") {
    return logAndRespond(input, agentId, "allowed", decision.reason);
  }

  if (decision.decision === "denied") {
    return logAndRespond(input, agentId, "denied", decision.reason);
  }

  // approval_required - create request and approval request
  const [requestRecord] = await db
    .insert(requests)
    .values({
      workspaceId: input.workspace_id,
      agentId,
      upstreamId: input.upstream_id,
      toolName: input.tool_name,
      actionClass: input.action_class,
      riskLevel: input.risk_level,
      riskFlags: input.risk_flags,
      resource: input.resource,
      argsRedacted: input.args_redacted,
      argsHash: input.args_hash,
      requestHash: input.request_hash,
      decision: "approval_required",
      denialReason: null,
    })
    .returning();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const [approvalRequest] = await db
    .insert(approvalRequests)
    .values({
      workspaceId: input.workspace_id,
      agentId,
      requestId: requestRecord.id,
      status: "pending",
      expiresAt,
    })
    .returning();

  // Trigger notification asynchronously
  triggerNotification(approvalRequest.id);

  return NextResponse.json({
    decision: "approval_required",
    reason: decision.reason,
    request_id: requestRecord.id,
    approval_request_id: approvalRequest.id,
    expires_at: expiresAt.toISOString(),
  });
}

/**
 * Evaluate policy rules and leases
 */
function evaluatePolicy(
  input: AuthorizeInput,
  rules: typeof policyRules.$inferSelect[],
  leases: typeof policyLeases.$inferSelect[]
): { decision: "allowed" | "denied" | "approval_required"; reason: string } {
  // 1) Check explicit deny rules first
  for (const rule of rules) {
    if (rule.effect === "deny" && ruleMatches(rule, input)) {
      return { decision: "denied", reason: `Denied by rule: ${rule.name || rule.id}` };
    }
  }

  // 2) Check active leases
  for (const lease of leases) {
    if (leaseMatches(lease, input)) {
      return { decision: "allowed", reason: `Allowed by lease: ${lease.id}` };
    }
  }

  // 3) Check explicit allow rules
  for (const rule of rules) {
    if (rule.effect === "allow" && ruleMatches(rule, input)) {
      return { decision: "allowed", reason: `Allowed by rule: ${rule.name || rule.id}` };
    }
  }

  // 4) Check require_approval rules
  for (const rule of rules) {
    if (rule.effect === "require_approval" && ruleMatches(rule, input)) {
      return {
        decision: "approval_required",
        reason: `Approval required by rule: ${rule.name || rule.id}`,
      };
    }
  }

  // 5) Fall back to defaults
  return getDefaultDecision(input);
}

/**
 * Check if a rule matches the input
 */
function ruleMatches(
  rule: typeof policyRules.$inferSelect,
  input: AuthorizeInput
): boolean {
  // Check action class
  if (rule.actionClass !== "any" && rule.actionClass !== input.action_class) {
    return false;
  }

  // Check upstream
  if (rule.upstreamId && rule.upstreamId !== input.upstream_id) {
    return false;
  }

  // Check tool name
  if (rule.toolName && rule.toolName.toLowerCase() !== input.tool_name.toLowerCase()) {
    return false;
  }

  // Check recipient (exact email match)
  if (rule.recipientMatch) {
    const recipient = input.resource.recipient || input.resource.to;
    if (!recipient) return false;
    if (recipient.toLowerCase() !== rule.recipientMatch.toLowerCase()) return false;
  }

  // Check domain
  if (rule.domainMatch && rule.domainMatchType) {
    const domain = input.resource.domain || input.resource.urlHost;
    if (!domain) return false;

    const lowerDomain = domain.toLowerCase();
    const lowerPattern = rule.domainMatch.toLowerCase();

    if (rule.domainMatchType === "exact") {
      if (lowerDomain !== lowerPattern) return false;
    } else {
      // suffix match
      if (lowerDomain !== lowerPattern && !lowerDomain.endsWith(`.${lowerPattern}`)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if a lease matches the input
 */
function leaseMatches(
  lease: typeof policyLeases.$inferSelect,
  input: AuthorizeInput
): boolean {
  if (lease.actionClass !== input.action_class) return false;
  if (lease.upstreamId && lease.upstreamId !== input.upstream_id) return false;
  if (lease.toolName && lease.toolName.toLowerCase() !== input.tool_name.toLowerCase()) {
    return false;
  }

  // Check recipient (exact email match)
  if (lease.recipientMatch) {
    const recipient = input.resource.recipient || input.resource.to;
    if (!recipient) return false;
    if (recipient.toLowerCase() !== lease.recipientMatch.toLowerCase()) return false;
  }

  if (lease.domainMatch && lease.domainMatchType) {
    const domain = input.resource.domain || input.resource.urlHost;
    if (!domain) return false;

    const lowerDomain = domain.toLowerCase();
    const lowerPattern = lease.domainMatch.toLowerCase();

    if (lease.domainMatchType === "exact") {
      if (lowerDomain !== lowerPattern) return false;
    } else {
      if (lowerDomain !== lowerPattern && !lowerDomain.endsWith(`.${lowerPattern}`)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get default decision based on action class
 */
function getDefaultDecision(
  input: AuthorizeInput
): { decision: "allowed" | "denied" | "approval_required"; reason: string } {
  switch (input.action_class) {
    case "execute":
      return { decision: "approval_required", reason: "Execute actions require approval by default" };
    case "submit":
      return { decision: "approval_required", reason: "Submit actions require approval by default" };
    case "transfer_value":
      return { decision: "denied", reason: "Transfer actions are denied by default" };
    case "send":
      if (input.risk_flags.external_domain) {
        return { decision: "approval_required", reason: "External send requires approval" };
      }
      return { decision: "allowed", reason: "Default allow for internal send" };
    default:
      return { decision: "allowed", reason: "Default allow" };
  }
}

/**
 * Log request and return response
 */
async function logAndRespond(
  input: AuthorizeInput,
  agentId: string,
  decision: "allowed" | "denied",
  reason: string
): Promise<NextResponse> {
  // Log to requests table
  const [requestRecord] = await db
    .insert(requests)
    .values({
      workspaceId: input.workspace_id,
      agentId,
      upstreamId: input.upstream_id,
      toolName: input.tool_name,
      actionClass: input.action_class,
      riskLevel: input.risk_level,
      riskFlags: input.risk_flags,
      resource: input.resource,
      argsRedacted: input.args_redacted,
      argsHash: input.args_hash,
      requestHash: input.request_hash,
      decision,
      denialReason: decision === "denied" ? reason : null,
    })
    .returning();

  return NextResponse.json({
    decision,
    reason,
    request_id: requestRecord.id,
  });
}

/**
 * Trigger notification asynchronously
 */
async function triggerNotification(approvalRequestId: string): Promise<void> {
  try {
    const { notifyApprovalRequired } = await import("@/lib/telegram/bot");
    await notifyApprovalRequired(approvalRequestId);
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}
