import { db } from "@/lib/db";
import { upstreams, type Upstream } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface UpstreamForwardResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false };
  }
}

async function readFirstSseEventJson(
  response: Response,
  timeoutMs: number
): Promise<{ ok: true; value: unknown } | { ok: false; error: string; raw?: string }> {
  const body = response.body;
  if (!body) return { ok: false, error: "Missing response body" };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    if (buffer.length > 128 * 1024) {
      return { ok: false, error: "SSE response too large", raw: buffer.slice(0, 500) };
    }

    const normalized = buffer.replace(/\r\n/g, "\n");
    const sepIndex = normalized.indexOf("\n\n");
    if (sepIndex === -1) continue;

    const eventBlock = normalized.slice(0, sepIndex);
    const lines = eventBlock.split("\n");
    const dataLines = lines
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice("data:".length).trimStart());
    const data = dataLines.join("\n").trim();

    if (!data) return { ok: false, error: "Empty SSE data", raw: eventBlock.slice(0, 500) };

    const parsed = parseJson(data);
    if (!parsed.ok) {
      return { ok: false, error: "Invalid JSON in SSE data", raw: data.slice(0, 500) };
    }
    return { ok: true, value: parsed.value };
  }

  return { ok: false, error: "Timed out reading SSE response", raw: buffer.slice(0, 500) };
}

async function parseMcpHttpResponse(
  response: Response,
  timeoutMs: number
): Promise<{ ok: true; value: unknown } | { ok: false; error: string; raw?: string }> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return readFirstSseEventJson(response, timeoutMs);
  }

  const text = await response.text();
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return { ok: false, error: "Non-JSON response", raw: text.slice(0, 500) };
  }
  return { ok: true, value: parsed.value };
}

type SessionCacheEntry = { sessionId: string; expiresAtMs: number };
const sessionCache = new Map<string, SessionCacheEntry>();

async function getOrCreateSessionId(upstream: Upstream): Promise<string | null> {
  const cacheKey = upstream.id;
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now()) return cached.sessionId;

  const url = getMcpEndpointUrl(upstream);
  const authHeaders = buildAuthHeaders(upstream);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const initReq = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "latch", version: "0.1.0" },
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...authHeaders,
      },
      body: JSON.stringify(initReq),
      signal: controller.signal,
    });

    const sessionId = res.headers.get("mcp-session-id");
    res.body?.cancel();

    if (!sessionId) return null;
    sessionCache.set(cacheKey, { sessionId, expiresAtMs: Date.now() + 30 * 60 * 1000 });
    return sessionId;
  } finally {
    clearTimeout(timeout);
  }
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
  const derived: Record<string, string> = {};

  if (upstream.authType === "bearer" && upstream.authValue) {
    derived["Authorization"] = `Bearer ${upstream.authValue}`;
  } else if (upstream.authType === "header" && upstream.authValue) {
    // Format: "Header-Name: value"
    const parts = upstream.authValue.split(":");
    if (parts.length >= 2) {
      const headerName = parts[0].trim();
      const headerValue = parts.slice(1).join(":").trim();
      derived[headerName] = headerValue;
    }
  }

  // `upstream.headers` is the v1 path; it should win over legacy authType/authValue.
  return {
    ...derived,
    ...(upstream.headers ?? {}),
  };
}

function getMcpEndpointUrl(upstream: Upstream): string {
  // `baseUrl` historically meant "base" and we appended `/mcp`.
  // Many remote servers publish the full endpoint already (e.g. https://host/foo/mcp).
  const raw = upstream.baseUrl ?? "";
  const u = new URL(raw);
  if (u.pathname.endsWith("/mcp")) return u.toString();
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  u.pathname += "mcp";
  return u.toString();
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
    if (upstream.transport !== "http" || !upstream.baseUrl) {
      return {
        success: false,
        error: "Upstream is not configured for HTTP forwarding",
      };
    }

    const url = getMcpEndpointUrl(upstream);
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

    const sessionId = await getOrCreateSessionId(upstream);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Some remote MCP servers require clients to accept both JSON and SSE.
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        ...authHeaders,
      },
      body: JSON.stringify(mcpRequest),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const parsed = await parseMcpHttpResponse(response, 15000);
    if (!parsed.ok) {
      return {
        success: false,
        error: `${parsed.error} (HTTP ${response.status})`,
        data: parsed.raw,
        statusCode: response.status,
      };
    }
    const data = parsed.value;

    if (!response.ok) {
      const errorMessage =
        isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
          ? data.error.message
          : `HTTP ${response.status}`;
      return {
        success: false,
        error: errorMessage,
        statusCode: response.status,
      };
    }

    // Check for JSON-RPC error
    if (isRecord(data) && isRecord(data.error)) {
      const msg =
        typeof data.error.message === "string" ? data.error.message : "Unknown error";
      return {
        success: false,
        error: msg,
        data: data.error,
      };
    }

    return {
      success: true,
      data: isRecord(data) ? data.result : undefined,
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
    if (upstream.transport !== "http" || !upstream.baseUrl) {
      return { error: "Upstream is not configured for HTTP tool discovery" };
    }

    const url = getMcpEndpointUrl(upstream);
    const authHeaders = buildAuthHeaders(upstream);

    const mcpRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/list",
      params: {},
    };

    const sessionId = await getOrCreateSessionId(upstream);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        ...authHeaders,
      },
      body: JSON.stringify(mcpRequest),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const parsed = await parseMcpHttpResponse(response, 15000);
    if (!parsed.ok) {
      return { error: `${parsed.error} (HTTP ${response.status})` };
    }
    const data = parsed.value;

    if (!response.ok) {
      const msg =
        isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
          ? data.error.message
          : `HTTP ${response.status}`;
      return { error: msg };
    }

    if (isRecord(data) && isRecord(data.error)) {
      const msg =
        typeof data.error.message === "string" ? data.error.message : "Unknown error";
      return { error: msg };
    }

    const tools =
      isRecord(data) && isRecord(data.result) && Array.isArray(data.result.tools)
        ? (data.result.tools as unknown[])
        : [];
    return { tools };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}
