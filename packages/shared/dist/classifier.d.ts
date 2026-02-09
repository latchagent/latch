import type { ActionClass, RiskFlags, ClassificationResult } from "./types.js";
/**
 * Classify a tool call deterministically
 *
 * @param toolName - The MCP tool name
 * @param args - The tool call arguments
 * @returns Classification result with action class, risk level, flags, and metadata
 */
export declare function classifyToolCall(toolName: string, args: unknown): ClassificationResult;
/**
 * Get default decision for an action class.
 *
 * All action classes default to "allowed". Users can create rules to restrict
 * specific actions (deny or require approval) for their workspace.
 */
export declare function getDefaultDecision(actionClass: ActionClass, riskFlags?: RiskFlags): "allowed" | "denied" | "approval_required";
//# sourceMappingURL=classifier.d.ts.map