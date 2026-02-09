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
import { hashToken } from "@latchagent/shared";
import { evaluateSmartCondition } from "@/lib/proxy/smart-rules";

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
    return handleFreshRequest(input, agent.id, request.nextUrl.origin);
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
  agentId: string,
  origin: string
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

  // Evaluate policy (async for smart rules)
  const decision = await evaluatePolicy(input, rules, leases);

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
      // NOTE: `denialReason` is used in the UI audit log; we store the policy reason here
      // for non-allowed decisions (including approvals) so users can debug rule matches.
      denialReason: decision.reason,
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

  const approvalUrl = `${origin.replace(/\/$/, "")}/approvals`;

  return NextResponse.json({
    decision: "approval_required",
    reason: decision.reason,
    request_id: requestRecord.id,
    approval_request_id: approvalRequest.id,
    expires_at: expiresAt.toISOString(),
    // UX helpers (additive; safe for older clients)
    approval_url: approvalUrl,
    next_steps:
      "Approval required. Open the Latch dashboard Approvals page to approve/deny. If your client supports it, it will auto-resume after approval.",
  });
}

/**
 * Evaluate policy rules and leases
 */
async function evaluatePolicy(
  input: AuthorizeInput,
  rules: typeof policyRules.$inferSelect[],
  leases: typeof policyLeases.$inferSelect[]
): Promise<{ decision: "allowed" | "denied" | "approval_required"; reason: string }> {
  type SpecificityKey = [number, number, number, number, number];

  const keyForRule = (rule: typeof policyRules.$inferSelect): SpecificityKey => [
    rule.toolName ? 1 : 0,
    rule.upstreamId ? 1 : 0,
    rule.recipientMatch ? 1 : 0,
    rule.domainMatch ? 1 : 0,
    rule.actionClass !== "any" ? 1 : 0,
  ];

  const keyForLease = (lease: typeof policyLeases.$inferSelect): SpecificityKey => [
    lease.toolName ? 1 : 0,
    lease.upstreamId ? 1 : 0,
    lease.recipientMatch ? 1 : 0,
    lease.domainMatch ? 1 : 0,
    1, // leases always constrain action class
  ];

  const compareKey = (a: SpecificityKey, b: SpecificityKey): number => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return b[i] - a[i]; // desc
    }
    return 0;
  };

  // 1) Evaluate smart rules first (LLM-powered) - highest precedence
  const smartRules = rules.filter((r) => r.smartCondition && smartRuleScopeMatches(r, input));
  
  if (smartRules.length > 0) {
    const smartResults = await Promise.all(
      smartRules.map(async (rule) => {
        const result = await evaluateSmartCondition(
          input.tool_name,
          input.args_redacted, // Use redacted args (still contains paths/patterns)
          rule.smartCondition!
        );
        return { rule, result };
      })
    );

    // Find matching smart rule (newest first)
    const matchingSmartRule = smartResults
      .filter((r) => r.result.matches)
      .sort((a, b) => new Date(b.rule.createdAt).getTime() - new Date(a.rule.createdAt).getTime())[0];

    if (matchingSmartRule) {
      const { rule, result } = matchingSmartRule;
      const effectMap: Record<string, "allowed" | "denied" | "approval_required"> = {
        allow: "allowed",
        deny: "denied",
        require_approval: "approval_required",
      };
      return {
        decision: effectMap[rule.effect] || "approval_required",
        reason: `Smart rule: ${rule.name || rule.id} - ${result.reason}`,
      };
    }
  }

  // 2) Evaluate pattern-based rules and leases
  const matchingRules = rules.filter((r) => ruleMatches(r, input));
  const matchingLeases = leases.filter((l) => leaseMatches(l, input));

  const candidates: Array<
    | {
        kind: "rule";
        key: SpecificityKey;
        createdAt: Date;
        rule: typeof policyRules.$inferSelect;
      }
    | {
        kind: "lease";
        key: SpecificityKey;
        createdAt: Date;
        lease: typeof policyLeases.$inferSelect;
      }
  > = [
    ...matchingRules.map((rule) => ({
      kind: "rule" as const,
      key: keyForRule(rule),
      createdAt: new Date(rule.createdAt),
      rule,
    })),
    ...matchingLeases.map((lease) => ({
      kind: "lease" as const,
      key: keyForLease(lease),
      createdAt: new Date(lease.createdAt),
      lease,
    })),
  ];

  candidates.sort((a, b) => {
    const spec = compareKey(a.key, b.key);
    if (spec !== 0) return spec;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const winner = candidates[0];
  if (winner) {
    if (winner.kind === "lease") {
      return { decision: "allowed", reason: `Allowed by lease: ${winner.lease.id}` };
    }

    if (winner.rule.effect === "allow") {
      return { decision: "allowed", reason: `Allowed by rule: ${winner.rule.name || winner.rule.id}` };
    }

    if (winner.rule.effect === "deny") {
      return { decision: "denied", reason: `Denied by rule: ${winner.rule.name || winner.rule.id}` };
    }

    return {
      decision: "approval_required",
      reason: `Approval required by rule: ${winner.rule.name || winner.rule.id}`,
    };
  }

  return getDefaultDecision(input);
}

/**
 * Check if a smart rule's scope matches (before LLM evaluation)
 */
function smartRuleScopeMatches(
  rule: typeof policyRules.$inferSelect,
  input: AuthorizeInput
): boolean {
  // Check upstream constraint
  if (rule.upstreamId && rule.upstreamId !== input.upstream_id) {
    return false;
  }
  // Check tool name constraint
  if (rule.toolName && rule.toolName.toLowerCase() !== input.tool_name.toLowerCase()) {
    return false;
  }
  return true;
}

/**
 * Check if a rule matches the input
 */
function ruleMatches(
  rule: typeof policyRules.$inferSelect,
  input: AuthorizeInput
): boolean {
  // Smart rules are evaluated separately via LLM
  if (rule.smartCondition) {
    return false;
  }

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
 * Get default decision based on action class.
 *
 * All action classes default to "allowed". Users can create rules to restrict
 * specific actions (deny or require approval) for their workspace.
 */
function getDefaultDecision(
  input: AuthorizeInput
): { decision: "allowed" | "denied" | "approval_required"; reason: string } {
  return { decision: "allowed", reason: "Default allow" };
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
