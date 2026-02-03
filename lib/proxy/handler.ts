import { db } from "@/lib/db";
import {
  agents,
  requests,
  type Request,
  type Agent,
  type Decision,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hashObject, createRequestHash, hashToken } from "@/lib/utils/hash";
import { classifyToolCall } from "./classifier";
import { redactArgs } from "./redactor";
import { evaluatePolicy } from "./policy-engine";
import {
  createApprovalRequest,
  validateApprovalToken,
  consumeToken,
} from "./approvals";
import { forwardToUpstream, getUpstream } from "./upstream";

export interface MCPToolCallRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: "tools/call";
  params: {
    name: string;
    arguments: unknown;
    approvalToken?: string;
  };
}

export interface MCPToolCallResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP JSON-RPC error codes
const MCP_ERROR_CODES = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom codes
  APPROVAL_REQUIRED: -32001,
  ACCESS_DENIED: -32002,
  TOKEN_INVALID: -32003,
};

export interface ProxyContext {
  workspaceId: string;
  agentId: string | null;
  upstreamId: string;
}

/**
 * Main proxy handler for MCP tool calls
 */
export async function handleToolCall(
  request: MCPToolCallRequest,
  ctx: ProxyContext
): Promise<MCPToolCallResponse> {
  const { name: toolName, arguments: args, approvalToken } = request.params;

  // Get upstream
  const upstream = await getUpstream(ctx.upstreamId);
  if (!upstream) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: "Upstream not found",
      },
    };
  }

  // Classify the tool call
  const classification = classifyToolCall(toolName, args);

  // Compute hashes
  const argsHash = hashObject(args);
  const requestHash = createRequestHash(toolName, ctx.upstreamId, argsHash);

  // Redact args for storage
  const { redacted: argsRedacted } = redactArgs(args);

  // Check for approval token
  if (approvalToken) {
    const tokenValidation = await validateApprovalToken(
      approvalToken,
      toolName,
      ctx.upstreamId,
      argsHash,
      requestHash
    );

    if (!tokenValidation.valid) {
      // Log the failed token attempt
      await logRequest(ctx, {
        toolName,
        classification,
        argsRedacted,
        argsHash,
        requestHash,
        decision: "denied",
        denialReason: `Token validation failed: ${tokenValidation.error}`,
      });

      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.TOKEN_INVALID,
          message: tokenValidation.error!,
          data: { code: "TOKEN_INVALID" },
        },
      };
    }

    // Token is valid - consume it and forward
    await consumeToken(tokenValidation.token!.id);

    // Log the approved request
    await logRequest(ctx, {
      toolName,
      classification,
      argsRedacted,
      argsHash,
      requestHash,
      decision: "allowed",
      denialReason: null,
    });

    // Forward to upstream
    const result = await forwardToUpstream(upstream, toolName, args);

    if (!result.success) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.INTERNAL_ERROR,
          message: result.error || "Upstream error",
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: result.data,
    };
  }

  // Evaluate policy
  const policyDecision = await evaluatePolicy({
    workspaceId: ctx.workspaceId,
    toolName,
    upstreamId: ctx.upstreamId,
    actionClass: classification.actionClass,
    domain: classification.resource.domain,
    riskFlags: classification.riskFlags,
  });

  // Log the request
  const requestRecord = await logRequest(ctx, {
    toolName,
    classification,
    argsRedacted,
    argsHash,
    requestHash,
    decision: policyDecision.decision,
    denialReason:
      policyDecision.decision === "denied" ? policyDecision.reason : null,
  });

  // Handle decision
  switch (policyDecision.decision) {
    case "allowed": {
      // Forward to upstream
      const result = await forwardToUpstream(upstream, toolName, args);

      if (!result.success) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: MCP_ERROR_CODES.INTERNAL_ERROR,
            message: result.error || "Upstream error",
          },
        };
      }

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: result.data,
      };
    }

    case "denied": {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.ACCESS_DENIED,
          message: policyDecision.reason,
          data: { code: "ACCESS_DENIED" },
        },
      };
    }

    case "approval_required": {
      // Create approval request - return immediately, don't block
      const approvalRequest = await createApprovalRequest(
        requestRecord.id,
        ctx.workspaceId,
        ctx.agentId
      );

      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.APPROVAL_REQUIRED,
          message: "This action requires human approval",
          data: {
            code: "APPROVAL_REQUIRED",
            approval_request_id: approvalRequest.id,
            reason: policyDecision.reason,
            action_class: classification.actionClass,
            risk_level: classification.riskLevel,
            tool_name: toolName,
            expires_at: approvalRequest.expiresAt.toISOString(),
          },
        },
      };
    }
  }
}

interface LogRequestInput {
  toolName: string;
  classification: ReturnType<typeof classifyToolCall>;
  argsRedacted: Record<string, unknown>;
  argsHash: string;
  requestHash: string;
  decision: Decision;
  denialReason: string | null;
}

/**
 * Log a request to the database
 */
async function logRequest(
  ctx: ProxyContext,
  input: LogRequestInput
): Promise<Request> {
  const [record] = await db
    .insert(requests)
    .values({
      workspaceId: ctx.workspaceId,
      agentId: ctx.agentId,
      upstreamId: ctx.upstreamId,
      toolName: input.toolName,
      actionClass: input.classification.actionClass,
      riskLevel: input.classification.riskLevel,
      riskFlags: input.classification.riskFlags,
      resource: input.classification.resource,
      argsRedacted: input.argsRedacted,
      argsHash: input.argsHash,
      requestHash: input.requestHash,
      decision: input.decision,
      denialReason: input.denialReason,
    })
    .returning();

  // Update agent last_seen_at
  if (ctx.agentId) {
    await db
      .update(agents)
      .set({ lastSeenAt: new Date() })
      .where(eq(agents.id, ctx.agentId));
  }

  return record;
}

/**
 * Authenticate an agent by client key
 */
export async function authenticateAgent(
  workspaceId: string,
  clientKey: string
): Promise<Agent | null> {
  const keyHash = hashToken(clientKey);

  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.workspaceId, workspaceId), eq(agents.clientKeyHash, keyHash))
    );

  return agent || null;
}
