import { db } from "@/lib/db";
import {
  policyRules,
  policyLeases,
  type PolicyRule,
  type PolicyLease,
  type ActionClass,
  type Decision,
} from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { getDefaultDecision } from "./classifier";
import { evaluateSmartCondition } from "./smart-rules";

export interface PolicyContext {
  workspaceId: string;
  toolName: string;
  toolArgs?: unknown; // For smart rule evaluation
  upstreamId: string;
  actionClass: ActionClass;
  domain?: string;
  riskFlags: Record<string, boolean>;
}

export interface PolicyDecision {
  decision: Decision;
  reason: string;
  matchedRule?: PolicyRule;
  matchedLease?: PolicyLease;
  smartRuleReason?: string; // Explanation from LLM when smart rule matches
}

type SpecificityKey = [number, number, number, number, number];

function specificityKeyForRule(rule: PolicyRule): SpecificityKey {
  return [
    rule.toolName ? 1 : 0,
    rule.upstreamId ? 1 : 0,
    rule.domainMatch ? 1 : 0,
    rule.recipientMatch ? 1 : 0,
    rule.actionClass !== "any" ? 1 : 0,
  ];
}

function specificityKeyForLease(lease: PolicyLease): SpecificityKey {
  return [
    lease.toolName ? 1 : 0,
    lease.upstreamId ? 1 : 0,
    lease.domainMatch ? 1 : 0,
    0,
    1, // leases always constrain actionClass
  ];
}

function compareSpecificity(a: SpecificityKey, b: SpecificityKey): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i]; // desc
  }
  return 0;
}

/**
 * Check if a domain matches a pattern
 */
function matchesDomain(
  domain: string | undefined,
  pattern: string,
  matchType: "exact" | "suffix"
): boolean {
  if (!domain) return false;

  const lowerDomain = domain.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  if (matchType === "exact") {
    return lowerDomain === lowerPattern;
  }

  // Suffix match
  return lowerDomain === lowerPattern || lowerDomain.endsWith(`.${lowerPattern}`);
}

/**
 * Check if a rule matches the context (for pattern-based rules)
 * Smart rules are handled separately via LLM evaluation
 */
function ruleMatches(rule: PolicyRule, ctx: PolicyContext): boolean {
  // Smart rules are evaluated separately
  if (rule.smartCondition) {
    return false;
  }

  // Check action class
  if (rule.actionClass !== "any" && rule.actionClass !== ctx.actionClass) {
    return false;
  }

  // Check upstream
  if (rule.upstreamId && rule.upstreamId !== ctx.upstreamId) {
    return false;
  }

  // Check tool name
  if (rule.toolName && rule.toolName.toLowerCase() !== ctx.toolName.toLowerCase()) {
    return false;
  }

  // Check domain
  if (rule.domainMatch && rule.domainMatchType) {
    if (!matchesDomain(ctx.domain, rule.domainMatch, rule.domainMatchType)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a smart rule's scope matches (upstream/tool constraints before LLM eval)
 */
function smartRuleScopeMatches(rule: PolicyRule, ctx: PolicyContext): boolean {
  // Check upstream constraint
  if (rule.upstreamId && rule.upstreamId !== ctx.upstreamId) {
    return false;
  }

  // Check tool name constraint
  if (rule.toolName && rule.toolName.toLowerCase() !== ctx.toolName.toLowerCase()) {
    return false;
  }

  return true;
}

/**
 * Check if a lease matches the context and is still valid
 */
function leaseMatches(lease: PolicyLease, ctx: PolicyContext): boolean {
  // Check expiration
  if (new Date(lease.expiresAt) < new Date()) {
    return false;
  }

  // Check action class
  if (lease.actionClass !== ctx.actionClass) {
    return false;
  }

  // Check upstream
  if (lease.upstreamId && lease.upstreamId !== ctx.upstreamId) {
    return false;
  }

  // Check tool name
  if (lease.toolName && lease.toolName.toLowerCase() !== ctx.toolName.toLowerCase()) {
    return false;
  }

  // Check domain
  if (lease.domainMatch && lease.domainMatchType) {
    if (!matchesDomain(ctx.domain, lease.domainMatch, lease.domainMatchType)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate policy for a tool call
 */
export async function evaluatePolicy(ctx: PolicyContext): Promise<PolicyDecision> {
  // Fetch all enabled rules for the workspace
  const rules = await db
    .select()
    .from(policyRules)
    .where(
      and(eq(policyRules.workspaceId, ctx.workspaceId), eq(policyRules.enabled, true))
    )
    .orderBy(policyRules.createdAt);

  // Fetch active leases for the workspace
  const leases = await db
    .select()
    .from(policyLeases)
    .where(
      and(
        eq(policyLeases.workspaceId, ctx.workspaceId),
        gte(policyLeases.expiresAt, new Date())
      )
    );

  // 1) Evaluate smart rules first (LLM-powered)
  // Smart rules take highest precedence when they match
  const smartRules = rules.filter((r) => r.smartCondition && smartRuleScopeMatches(r, ctx));

  if (smartRules.length > 0 && ctx.toolArgs !== undefined) {
    // Evaluate smart rules in parallel
    const smartResults = await Promise.all(
      smartRules.map(async (rule) => {
        const result = await evaluateSmartCondition(
          ctx.toolName,
          ctx.toolArgs,
          rule.smartCondition!
        );
        return { rule, result };
      })
    );

    // Find the first matching smart rule (ordered by createdAt desc for most recent)
    const matchingSmartRule = smartResults
      .filter((r) => r.result.matches)
      .sort((a, b) => new Date(b.rule.createdAt).getTime() - new Date(a.rule.createdAt).getTime())[0];

    if (matchingSmartRule) {
      const { rule, result } = matchingSmartRule;
      const effectMap: Record<string, Decision> = {
        allow: "allowed",
        deny: "denied",
        require_approval: "approval_required",
      };

      return {
        decision: effectMap[rule.effect] || "approval_required",
        reason: `Smart rule matched: ${rule.name || rule.id}`,
        matchedRule: rule,
        smartRuleReason: result.reason,
      };
    }
  }

  // 2) Evaluate pattern-based rules and leases
  const matchingRules = rules.filter((r) => ruleMatches(r, ctx));
  const matchingLeases = leases.filter((l) => leaseMatches(l, ctx));

  const candidates: Array<
    | { kind: "rule"; rule: PolicyRule; key: SpecificityKey; createdAt: Date }
    | { kind: "lease"; lease: PolicyLease; key: SpecificityKey; createdAt: Date }
  > = [
    ...matchingRules.map((rule) => ({
      kind: "rule" as const,
      rule,
      key: specificityKeyForRule(rule),
      createdAt: new Date(rule.createdAt),
    })),
    ...matchingLeases.map((lease) => ({
      kind: "lease" as const,
      lease,
      key: specificityKeyForLease(lease),
      createdAt: new Date(lease.createdAt),
    })),
  ];

  candidates.sort((a, b) => {
    const spec = compareSpecificity(a.key, b.key);
    if (spec !== 0) return spec;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const winner = candidates[0];
  if (winner) {
    if (winner.kind === "lease") {
      return {
        decision: "allowed",
        reason: `Allowed by active lease: ${winner.lease.id}`,
        matchedLease: winner.lease,
      };
    }

    if (winner.rule.effect === "allow") {
      return {
        decision: "allowed",
        reason: `Allowed by policy rule: ${winner.rule.id}`,
        matchedRule: winner.rule,
      };
    }

    if (winner.rule.effect === "deny") {
      return {
        decision: "denied",
        reason: `Denied by policy rule: ${winner.rule.id}`,
        matchedRule: winner.rule,
      };
    }

    return {
      decision: "approval_required",
      reason: `Approval required by policy rule: ${winner.rule.id}`,
      matchedRule: winner.rule,
    };
  }

  // 3) Fall back to defaults based on action class
  const defaultDecision = getDefaultDecision(ctx.actionClass);

  // Special case: SEND to external domain requires approval by default
  if (
    ctx.actionClass === "send" &&
    ctx.riskFlags.external_domain &&
    defaultDecision === "allowed"
  ) {
    return {
      decision: "approval_required",
      reason: "External send operations require approval by default",
    };
  }

  return {
    decision: defaultDecision,
    reason: `Default policy for action class: ${ctx.actionClass}`,
  };
}

/**
 * Create a policy lease
 */
export async function createLease(
  workspaceId: string,
  userId: string,
  actionClass: ActionClass,
  durationMinutes: number,
  options?: {
    upstreamId?: string;
    toolName?: string;
    domainMatch?: string;
    domainMatchType?: "exact" | "suffix";
  }
): Promise<PolicyLease> {
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  const [lease] = await db
    .insert(policyLeases)
    .values({
      workspaceId,
      createdByUserId: userId,
      actionClass,
      upstreamId: options?.upstreamId,
      toolName: options?.toolName,
      domainMatch: options?.domainMatch,
      domainMatchType: options?.domainMatchType,
      expiresAt,
    })
    .returning();

  return lease;
}

/**
 * Create a deny rule for future similar actions
 */
export async function createDenyRule(
  workspaceId: string,
  actionClass: ActionClass,
  options?: {
    upstreamId?: string;
    toolName?: string;
    domainMatch?: string;
    domainMatchType?: "exact" | "suffix";
  }
): Promise<PolicyRule> {
  const [rule] = await db
    .insert(policyRules)
    .values({
      workspaceId,
      priority: 100, // High priority for explicit deny
      enabled: true,
      effect: "deny",
      actionClass,
      upstreamId: options?.upstreamId,
      toolName: options?.toolName,
      domainMatch: options?.domainMatch,
      domainMatchType: options?.domainMatchType,
    })
    .returning();

  return rule;
}
