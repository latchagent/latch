/**
 * Shared types for Latch CLI and Cloud
 */

export type ActionClass =
  | "read"
  | "write"
  | "send"
  | "execute"
  | "submit"
  | "transfer_value";

export type RiskLevel = "low" | "med" | "high" | "critical";

export type Decision = "allowed" | "denied" | "approval_required";

export interface RiskFlags {
  external_domain: boolean;
  new_recipient: boolean;
  attachment: boolean;
  form_submit: boolean;
  shell_exec: boolean;
  destructive: boolean;
}

export interface ResourceMetadata {
  domain?: string;
  recipientDomain?: string;
  recipient?: string; // Full email address (e.g., "user@example.com")
  to?: string; // Alias for recipient
  urlHost?: string;
  urlPath?: string;
}

export interface ClassificationResult {
  actionClass: ActionClass;
  riskLevel: RiskLevel;
  riskFlags: RiskFlags;
  resource: ResourceMetadata;
}

export interface RedactedArgs {
  [key: string]: unknown;
}

export interface RedactionResult {
  redacted: RedactedArgs;
  metadata: Record<string, unknown>;
}

/**
 * Request to /api/v1/authorize
 */
export interface AuthorizeRequest {
  workspace_id: string;
  agent_key: string;
  upstream_id: string;
  tool_name: string;
  action_class: ActionClass;
  risk_level: RiskLevel;
  risk_flags: RiskFlags;
  resource: ResourceMetadata;
  args_hash: string;
  request_hash: string;
  args_redacted: RedactedArgs;
  approval_token?: string; // Present on retry
}

/**
 * Response from /api/v1/authorize
 */
export interface AuthorizeResponse {
  decision: Decision;
  reason: string;
  request_id?: string; // For logging/audit
  approval_request_id?: string; // When decision is approval_required
  expires_at?: string; // When approval expires
}

/**
 * MCP JSON-RPC types
 */
export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
  approvalToken?: string;
}

/**
 * MCP Error Codes
 */
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom Latch codes
  APPROVAL_REQUIRED: -32001,
  ACCESS_DENIED: -32002,
  TOKEN_INVALID: -32003,
} as const;
