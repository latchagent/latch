import { spawn, type ChildProcess } from "child_process";
import {
  classifyToolCall,
  computeArgsHash,
  computeRequestHash,
  redactArgs,
  type MCPRequest,
  type MCPResponse,
  type MCPToolCallParams,
  type AuthorizeRequest,
  MCP_ERROR_CODES,
} from "@latch/shared";
import { CloudClient } from "./cloud-client.js";
import { MessageFramer } from "./message-framer.js";

function isMCPRequest(message: unknown): message is MCPRequest {
  if (!message || typeof message !== "object") return false;
  const m = message as Record<string, unknown>;
  if (m.jsonrpc !== "2.0") return false;
  if (typeof m.method !== "string") return false;
  const id = m.id;
  if (!(typeof id === "string" || typeof id === "number")) return false;
  return true;
}

export interface BridgeOptions {
  upstreamCommand: string;
  upstreamArgs: string[];
  cloudUrl: string;
  workspaceId?: string;
  agentKey?: string;
  upstreamId?: string;
  offline: boolean;
  waitForApproval?: boolean;
  approvalTimeoutMs?: number;
}

/**
 * Run the Latch MCP Bridge
 *
 * This function:
 * 1. Spawns the upstream MCP server as a child process
 * 2. Intercepts all MCP messages from stdin (from the client)
 * 3. For tools/call: classifies, checks policy, forwards if allowed
 * 4. Pipes upstream responses back to stdout (to the client)
 */
export async function runBridge(options: BridgeOptions): Promise<void> {
  // Validate required options for cloud mode
  if (!options.offline) {
    if (!options.workspaceId) {
      console.error("Error: --workspace is required (or set LATCH_WORKSPACE)");
      process.exit(1);
    }
    if (!options.agentKey) {
      console.error("Error: --agent-key is required (or set LATCH_AGENT_KEY)");
      process.exit(1);
    }
    if (!options.upstreamId) {
      console.error("Error: --upstream-id is required (or set LATCH_UPSTREAM_ID)");
      process.exit(1);
    }
  }

  // Initialize cloud client
  const cloud = options.offline
    ? null
    : new CloudClient({
        baseUrl: options.cloudUrl,
        workspaceId: options.workspaceId!,
        agentKey: options.agentKey!,
        upstreamId: options.upstreamId!,
      });

  // Spawn upstream MCP server
  const upstream = spawn(options.upstreamCommand, options.upstreamArgs, {
    stdio: ["pipe", "pipe", "inherit"], // stdin, stdout to pipes; stderr inherited
  });

  // Set up message framers for proper JSON-RPC message handling
  const clientFramer = new MessageFramer();
  const upstreamFramer = new MessageFramer();

  // Track pending requests so we can match responses
  const pendingRequests = new Map<
    string | number,
    {
      request: MCPRequest;
      forwarded: boolean;
    }
  >();

  // Handle upstream exit
  upstream.on("exit", (code, signal) => {
    if (code !== 0) {
      console.error(`Upstream exited with code ${code}, signal ${signal}`);
    }
    process.exit(code ?? 1);
  });

  upstream.on("error", (err) => {
    console.error("Upstream error:", err.message);
    process.exit(1);
  });

  // Process messages from client (stdin)
  process.stdin.on("data", (chunk) => {
    const messages = clientFramer.push(chunk);
    for (const message of messages) {
      if (!isMCPRequest(message)) continue;
      handleClientMessage(message, upstream, cloud, pendingRequests, options);
    }
  });

  process.stdin.on("end", () => {
    upstream.stdin?.end();
  });

  // Process messages from upstream (stdout)
  upstream.stdout?.on("data", (chunk) => {
    const messages = upstreamFramer.push(chunk);
    for (const message of messages) {
      // Upstream messages can be notifications/responses; validate inside handler.
      handleUpstreamMessage(message as MCPResponse, pendingRequests);
    }
  });

  // Handle our own exit
  process.on("SIGINT", () => {
    upstream.kill("SIGINT");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    upstream.kill("SIGTERM");
    process.exit(0);
  });
}

/**
 * Handle a message from the client
 */
async function handleClientMessage(
  message: MCPRequest,
  upstream: ChildProcess,
  cloud: CloudClient | null,
  pendingRequests: Map<string | number, { request: MCPRequest; forwarded: boolean }>,
  options: BridgeOptions
): Promise<void> {
  // If not a tools/call, pass through directly
  if (message.method !== "tools/call") {
    forwardToUpstream(message, upstream);
    pendingRequests.set(message.id, { request: message, forwarded: true });
    return;
  }

  // Handle tools/call with policy check
  const params = message.params as MCPToolCallParams;
  const toolName = params.name;
  const args = params.arguments || {};
  // approvalToken can be in:
  // 1. params._meta.approvalToken (MCP Inspector's "Tool-specific Metadata")
  // 2. args.approvalToken (direct in arguments)
  const paramsAny = params as unknown as Record<string, unknown>;
  const meta = paramsAny._meta as Record<string, unknown> | undefined;
  const argsAny = args as Record<string, unknown>;
  const approvalToken = 
    (meta?.approvalToken as string | undefined) || 
    (argsAny.approvalToken as string | undefined);

  // Classify the action locally
  const classification = classifyToolCall(toolName, args);

  // Compute hashes locally
  const argsHash = computeArgsHash(args);
  const requestHash = computeRequestHash(toolName, options.upstreamId || "", argsHash);

  // Redact args locally (never send raw args to cloud)
  const { redacted: argsRedacted } = redactArgs(args);

  // If offline mode, use local defaults
  if (!cloud) {
    // In offline mode, use default policy
    const defaultDecision = getDefaultDecisionLocal(classification);
    if (defaultDecision === "allowed") {
      forwardToUpstream(message, upstream);
      pendingRequests.set(message.id, { request: message, forwarded: true });
    } else {
      sendToClient(createErrorResponse(message.id, defaultDecision, "Offline mode"));
      pendingRequests.set(message.id, { request: message, forwarded: false });
    }
    return;
  }

  // Build authorize request
  const authorizeRequest: AuthorizeRequest = {
    workspace_id: cloud.workspaceId,
    agent_key: cloud.agentKey,
    upstream_id: cloud.upstreamId,
    tool_name: toolName,
    action_class: classification.actionClass,
    risk_level: classification.riskLevel,
    risk_flags: classification.riskFlags,
    resource: classification.resource,
    args_hash: argsHash,
    request_hash: requestHash,
    args_redacted: argsRedacted,
    approval_token: approvalToken,
  };

  try {
    // Call cloud API for authorization
    const response = await cloud.authorize(authorizeRequest);

    if (response.decision === "allowed") {
      // Forward to upstream
      forwardToUpstream(message, upstream);
      pendingRequests.set(message.id, { request: message, forwarded: true });
    } else if (response.decision === "denied") {
      // Return error to client
      sendToClient({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: MCP_ERROR_CODES.ACCESS_DENIED,
          message: response.reason,
          data: { code: "ACCESS_DENIED" },
        },
      });
      pendingRequests.set(message.id, { request: message, forwarded: false });
    } else if (response.decision === "approval_required") {
      // If wait-for-approval is enabled, poll for approval
      if (options.waitForApproval && response.approval_request_id) {
        console.error(`[latch] Waiting for approval (request: ${response.approval_request_id.slice(0, 8)}...)`);
        
        const approvalResult = await cloud.waitForApproval(
          response.approval_request_id,
          options.approvalTimeoutMs || 300000
        );

        if (approvalResult.approved && approvalResult.token) {
          console.error(`[latch] Approval received, retrying with token...`);
          
          // Retry the authorization with the token
          const retryRequest: AuthorizeRequest = {
            ...authorizeRequest,
            approval_token: approvalResult.token,
          };
          
          const retryResponse = await cloud.authorize(retryRequest);
          
          if (retryResponse.decision === "allowed") {
            forwardToUpstream(message, upstream);
            pendingRequests.set(message.id, { request: message, forwarded: true });
            return;
          } else {
            // Unexpected - token should have worked
            sendToClient({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: MCP_ERROR_CODES.ACCESS_DENIED,
                message: retryResponse.reason || "Retry failed after approval",
                data: { code: "ACCESS_DENIED" },
              },
            });
            pendingRequests.set(message.id, { request: message, forwarded: false });
            return;
          }
        } else {
          // Approval denied or timed out
          sendToClient({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: MCP_ERROR_CODES.ACCESS_DENIED,
              message: approvalResult.reason || "Approval denied or timed out",
              data: { code: "ACCESS_DENIED" },
            },
          });
          pendingRequests.set(message.id, { request: message, forwarded: false });
          return;
        }
      }

      // Return approval_required error to client (non-waiting mode)
      sendToClient({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: MCP_ERROR_CODES.APPROVAL_REQUIRED,
          message: "This action requires human approval",
          data: {
            code: "APPROVAL_REQUIRED",
            approval_request_id: response.approval_request_id,
            reason: response.reason,
            action_class: classification.actionClass,
            risk_level: classification.riskLevel,
            expires_at: response.expires_at,
          },
        },
      });
      pendingRequests.set(message.id, { request: message, forwarded: false });
    }
  } catch (error) {
    console.error("Cloud authorization error:", error);

    // Fail-closed for risky actions, fail-open for safe reads
    // This ensures agents can still read when cloud is down, but can't execute risky actions
    const isRiskyAction =
      classification.actionClass === "execute" ||
      classification.actionClass === "submit" ||
      classification.actionClass === "transfer_value" ||
      (classification.actionClass === "send" && classification.riskFlags.external_domain);

    if (isRiskyAction) {
      // FAIL-CLOSED: Deny risky actions when cloud is unreachable
      sendToClient({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: MCP_ERROR_CODES.INTERNAL_ERROR,
          message: "Authorization service unavailable - risky action blocked",
          data: { 
            code: "CLOUD_UNAVAILABLE",
            action_class: classification.actionClass,
            fail_mode: "closed",
          },
        },
      });
      pendingRequests.set(message.id, { request: message, forwarded: false });
    } else {
      // FAIL-OPEN: Allow safe reads/writes when cloud is unreachable
      console.error("Cloud unavailable, allowing safe action:", classification.actionClass);
      forwardToUpstream(message, upstream);
      pendingRequests.set(message.id, { request: message, forwarded: true });
    }
  }
}

/**
 * Handle a message from upstream
 */
function handleUpstreamMessage(
  message: MCPResponse,
  pendingRequests: Map<string | number, { request: MCPRequest; forwarded: boolean }>
): void {
  // Pass through all upstream messages to client
  sendToClient(message);

  // Clean up pending request tracking
  pendingRequests.delete(message.id);
}

/**
 * Forward a message to upstream
 */
function forwardToUpstream(message: MCPRequest, upstream: ChildProcess): void {
  const data = JSON.stringify(message) + "\n";
  upstream.stdin?.write(data);
}

/**
 * Send a message to the client (stdout)
 */
function sendToClient(message: MCPResponse): void {
  const data = JSON.stringify(message) + "\n";
  process.stdout.write(data);
}

/**
 * Create an error response
 */
function createErrorResponse(
  id: string | number,
  decision: string,
  reason: string
): MCPResponse {
  const code =
    decision === "denied"
      ? MCP_ERROR_CODES.ACCESS_DENIED
      : MCP_ERROR_CODES.APPROVAL_REQUIRED;

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message: reason,
      data: { code: decision.toUpperCase() },
    },
  };
}

/**
 * Get default decision for offline mode
 */
function getDefaultDecisionLocal(
  classification: ReturnType<typeof classifyToolCall>
): "allowed" | "denied" | "approval_required" {
  switch (classification.actionClass) {
    case "execute":
    case "submit":
      return "approval_required";
    case "transfer_value":
      return "denied";
    case "send":
      return classification.riskFlags.external_domain ? "approval_required" : "allowed";
    default:
      return "allowed";
  }
}
