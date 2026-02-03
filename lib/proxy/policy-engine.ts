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

export interface PolicyContext {
  workspaceId: string;
  toolName: string;
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
 * Check if a rule matches the context
 */
function ruleMatches(rule: PolicyRule, ctx: PolicyContext): boolean {
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
 *
 * Evaluation order:
 * 1) explicit deny rules
 * 2) active allow leases
 * 3) explicit allow rules
 * 4) defaults based on action_class
 */
export async function evaluatePolicy(ctx: PolicyContext): Promise<PolicyDecision> {
  // Fetch all enabled rules for the workspace, ordered by priority
  const rules = await db
    .select()
    .from(policyRules)
    .where(
      and(eq(policyRules.workspaceId, ctx.workspaceId), eq(policyRules.enabled, true))
    )
    .orderBy(policyRules.priority);

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

  // 1) Check explicit deny rules first
  for (const rule of rules) {
    if (rule.effect === "deny" && ruleMatches(rule, ctx)) {
      return {
        decision: "denied",
        reason: `Denied by policy rule: ${rule.id}`,
        matchedRule: rule,
      };
    }
  }

  // 2) Check active allow leases
  for (const lease of leases) {
    if (leaseMatches(lease, ctx)) {
      return {
        decision: "allowed",
        reason: `Allowed by active lease: ${lease.id}`,
        matchedLease: lease,
      };
    }
  }

  // 3) Check explicit allow rules
  for (const rule of rules) {
    if (rule.effect === "allow" && ruleMatches(rule, ctx)) {
      return {
        decision: "allowed",
        reason: `Allowed by policy rule: ${rule.id}`,
        matchedRule: rule,
      };
    }
  }

  // 4) Check require_approval rules
  for (const rule of rules) {
    if (rule.effect === "require_approval" && ruleMatches(rule, ctx)) {
      return {
        decision: "approval_required",
        reason: `Approval required by policy rule: ${rule.id}`,
        matchedRule: rule,
      };
    }
  }

  // 5) Fall back to defaults based on action class
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
