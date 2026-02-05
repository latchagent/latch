import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  workspaces,
  workspaceMembers,
  agents,
  upstreams,
  policyRules,
} from "@/lib/db/schema";
import { user } from "@/lib/db/auth-schema";
import { eq } from "drizzle-orm";
import { generateSecureToken, hashToken } from "@latchagent/shared";

/**
 * POST /api/test/setup
 *
 * Test-only endpoint to create a workspace, agent, and upstream for testing.
 * Only available when NODE_ENV !== "production" or when TEST_SECRET matches.
 *
 * Returns the IDs and keys needed for running the test harness.
 */

const TEST_SECRET = process.env.TEST_SECRET || "test-secret-for-local-dev";

export async function POST(request: NextRequest) {
  // Security check
  const authHeader = request.headers.get("Authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");

  if (process.env.NODE_ENV === "production" && providedSecret !== TEST_SECRET) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const workspaceName = body.workspaceName || "Test Workspace";

    // Create or get test user
    let [testUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, "test@latch.dev"));

    if (!testUser) {
      [testUser] = await db
        .insert(user)
        .values({
          id: `test_user_${Date.now()}`,
          name: "Test User",
          email: "test@latch.dev",
          emailVerified: true,
        })
        .returning();
    }

    // Create workspace
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: workspaceName,
      })
      .returning();

    // Add user as owner
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: testUser.id,
      role: "owner",
    });

    // Create upstream
    const [upstream] = await db
      .insert(upstreams)
      .values({
        workspaceId: workspace.id,
        name: "Test Upstream",
        transport: "http",
        baseUrl: "http://localhost:9999", // Doesn't matter for stdio bridge
        authType: "none",
      })
      .returning();

    // Create agent with key
    const agentKey = generateSecureToken();
    const [agent] = await db
      .insert(agents)
      .values({
        workspaceId: workspace.id,
        name: "Test Agent",
        clientKeyHash: hashToken(agentKey),
      })
      .returning();

    // Create default policy rules
    await db.insert(policyRules).values([
      // Allow all READs
      {
        workspaceId: workspace.id,
        priority: 100,
        enabled: true,
        effect: "allow",
        actionClass: "read",
        name: "Allow all READs",
      },
      // Allow all WRITEs
      {
        workspaceId: workspace.id,
        priority: 100,
        enabled: true,
        effect: "allow",
        actionClass: "write",
        name: "Allow all WRITEs",
      },
      // Require approval for EXECUTE
      {
        workspaceId: workspace.id,
        priority: 50,
        enabled: true,
        effect: "require_approval",
        actionClass: "execute",
        name: "Approval for EXECUTE",
      },
      // Require approval for SUBMIT
      {
        workspaceId: workspace.id,
        priority: 50,
        enabled: true,
        effect: "require_approval",
        actionClass: "submit",
        name: "Approval for SUBMIT",
      },
      // Require approval for external SEND
      {
        workspaceId: workspace.id,
        priority: 50,
        enabled: true,
        effect: "require_approval",
        actionClass: "send",
        name: "Approval for SEND",
      },
      // Deny TRANSFER_VALUE
      {
        workspaceId: workspace.id,
        priority: 10,
        enabled: true,
        effect: "deny",
        actionClass: "transfer_value",
        name: "Deny TRANSFER_VALUE",
      },
    ]);

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
      upstream: {
        id: upstream.id,
        name: upstream.name,
      },
      agent: {
        id: agent.id,
        name: agent.name,
        clientKey: agentKey, // Return the raw key (not hash)
      },
      user: {
        id: testUser.id,
        email: testUser.email,
      },
      // Environment variable format for easy copy-paste
      envVars: {
        LATCH_WORKSPACE: workspace.id,
        LATCH_UPSTREAM_ID: upstream.id,
        LATCH_AGENT_KEY: agentKey,
      },
    });
  } catch (error) {
    console.error("Test setup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed" },
      { status: 500 }
    );
  }
}
