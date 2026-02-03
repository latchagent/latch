import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, upstreams } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hashToken } from "@/lib/utils/hash";
import { handleToolCall, type MCPToolCallRequest } from "@/lib/proxy/handler";

/**
 * MCP Proxy Endpoint
 *
 * This endpoint acts as an MCP server to agent clients.
 * It intercepts tool calls, evaluates policy, and forwards to upstream servers.
 *
 * Authentication: X-Latch-Key header with agent client key
 * Upstream selection: X-Latch-Upstream header or upstream query param
 */
export async function POST(request: NextRequest) {
  try {
    // Get authentication
    const clientKey = request.headers.get("X-Latch-Key");
    if (!clientKey) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Missing X-Latch-Key header",
          },
        },
        { status: 401 }
      );
    }

    // Get upstream identifier
    const upstreamName =
      request.headers.get("X-Latch-Upstream") ||
      request.nextUrl.searchParams.get("upstream");

    if (!upstreamName) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32602,
            message: "Missing upstream identifier (X-Latch-Upstream header or ?upstream= param)",
          },
        },
        { status: 400 }
      );
    }

    // Authenticate agent
    const keyHash = hashToken(clientKey);
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.clientKeyHash, keyHash));

    if (!agent) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid client key",
          },
        },
        { status: 401 }
      );
    }

    // Get upstream
    const [upstream] = await db
      .select()
      .from(upstreams)
      .where(
        and(
          eq(upstreams.workspaceId, agent.workspaceId),
          eq(upstreams.name, upstreamName)
        )
      );

    if (!upstream) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32602,
            message: `Upstream not found: ${upstreamName}`,
          },
        },
        { status: 404 }
      );
    }

    // Parse MCP request
    const body = await request.json();

    // Handle different MCP methods
    if (body.method === "tools/list") {
      // Forward tools/list to upstream
      const { listUpstreamTools } = await import("@/lib/proxy/upstream");
      const result = await listUpstreamTools(upstream);

      if ("error" in result) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32603,
            message: result.error,
          },
        });
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: result.tools },
      });
    }

    if (body.method === "tools/call") {
      const mcpRequest: MCPToolCallRequest = body;

      const response = await handleToolCall(mcpRequest, {
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        upstreamId: upstream.id,
      });

      // Determine HTTP status based on error code
      let status = 200;
      if (response.error) {
        if (response.error.code === -32001) {
          // APPROVAL_REQUIRED
          status = 202; // Accepted - action pending
        } else if (response.error.code === -32002) {
          // ACCESS_DENIED
          status = 403;
        } else if (response.error.code === -32003) {
          // TOKEN_INVALID
          status = 403;
        }
      }

      return NextResponse.json(response, { status });
    }

    // Unknown method
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32601,
          message: `Method not found: ${body.method}`,
        },
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
      },
      { status: 500 }
    );
  }
}
