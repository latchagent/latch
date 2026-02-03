import { db } from "@/lib/db";
import { upstreams, type Upstream } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface UpstreamForwardResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

/**
 * Get an upstream by ID
 */
export async function getUpstream(upstreamId: string): Promise<Upstream | null> {
  const [upstream] = await db
    .select()
    .from(upstreams)
    .where(eq(upstreams.id, upstreamId));
  return upstream || null;
}

/**
 * Get an upstream by name within a workspace
 */
export async function getUpstreamByName(
  workspaceId: string,
  name: string
): Promise<Upstream | null> {
  const [upstream] = await db
    .select()
    .from(upstreams)
    .where(and(eq(upstreams.workspaceId, workspaceId), eq(upstreams.name, name)));
  return upstream || null;
}

/**
 * Build authorization headers for an upstream
 */
function buildAuthHeaders(upstream: Upstream): Record<string, string> {
  const headers: Record<string, string> = {};

  if (upstream.authType === "bearer" && upstream.authValue) {
    headers["Authorization"] = `Bearer ${upstream.authValue}`;
  } else if (upstream.authType === "header" && upstream.authValue) {
    // Format: "Header-Name: value"
    const parts = upstream.authValue.split(":");
    if (parts.length >= 2) {
      const headerName = parts[0].trim();
      const headerValue = parts.slice(1).join(":").trim();
      headers[headerName] = headerValue;
    }
  }

  return headers;
}

/**
 * Forward a tool call to an upstream MCP server
 *
 * This implements the MCP client side - making requests to upstream servers
 */
export async function forwardToUpstream(
  upstream: Upstream,
  toolName: string,
  args: unknown
): Promise<UpstreamForwardResult> {
  try {
    const url = new URL("/mcp", upstream.baseUrl);
    const authHeaders = buildAuthHeaders(upstream);

    // MCP JSON-RPC request
    const mcpRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(mcpRequest),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || `HTTP ${response.status}`,
        statusCode: response.status,
      };
    }

    // Check for JSON-RPC error
    if (data.error) {
      return {
        success: false,
        error: data.error.message || "Unknown error",
        data: data.error,
      };
    }

    return {
      success: true,
      data: data.result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * List available tools from an upstream MCP server
 */
export async function listUpstreamTools(
  upstream: Upstream
): Promise<{ tools: unknown[] } | { error: string }> {
  try {
    const url = new URL("/mcp", upstream.baseUrl);
    const authHeaders = buildAuthHeaders(upstream);

    const mcpRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/list",
      params: {},
    };

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(mcpRequest),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      return { error: data.error?.message || `HTTP ${response.status}` };
    }

    return { tools: data.result?.tools || [] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}
