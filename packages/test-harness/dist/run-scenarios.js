#!/usr/bin/env npx tsx
/**
 * Run Latch Test Scenarios
 *
 * Usage:
 *   npx tsx packages/test-harness/src/run-scenarios.ts
 *
 * Environment variables:
 *   LATCH_CLOUD_URL - Cloud URL (default: http://localhost:3000)
 *   LATCH_WORKSPACE - Workspace ID
 *   LATCH_UPSTREAM_ID - Upstream ID
 *   LATCH_AGENT_KEY - Agent key
 */
import { ScenarioRunner } from "./runner.js";
import { BASE_SCENARIOS } from "./scenarios.js";
import * as path from "path";
const CLOUD_URL = process.env.LATCH_CLOUD_URL || "http://localhost:3000";
const WORKSPACE_ID = process.env.LATCH_WORKSPACE || "";
const UPSTREAM_ID = process.env.LATCH_UPSTREAM_ID || "";
const AGENT_KEY = process.env.LATCH_AGENT_KEY || "";
const VERBOSE = process.env.VERBOSE === "true";
// Check required env vars
if (!WORKSPACE_ID || !UPSTREAM_ID || !AGENT_KEY) {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Latch Test Harness                                              ║
╚══════════════════════════════════════════════════════════════════╝

Missing required environment variables. 

Required:
  LATCH_WORKSPACE   - Workspace ID (from dashboard URL)
  LATCH_UPSTREAM_ID - Upstream ID (from dashboard URL)
  LATCH_AGENT_KEY   - Agent client key (from agent creation)

Optional:
  LATCH_CLOUD_URL   - Cloud URL (default: http://localhost:3000)
  VERBOSE           - Show stderr output (default: false)

Example:
  LATCH_WORKSPACE="ws_abc123" \\
  LATCH_UPSTREAM_ID="up_def456" \\
  LATCH_AGENT_KEY="ak_ghi789" \\
  npx tsx packages/test-harness/src/run-scenarios.ts

Setup:
  1. Start the cloud: npm run dev
  2. Create a workspace, upstream, and agent in the dashboard
  3. Copy the IDs and agent key
  4. Run this script with the env vars above
`);
    process.exit(1);
}
async function main() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Latch Test Harness                                              ║
╚══════════════════════════════════════════════════════════════════╝

Cloud URL:    ${CLOUD_URL}
Workspace:    ${WORKSPACE_ID}
Upstream:     ${UPSTREAM_ID}
Verbose:      ${VERBOSE}
`);
    const runner = new ScenarioRunner({
        latchCommand: "node",
        latchArgs: [path.resolve("packages/cli/dist/index.js"), "run"],
        demoServerCommand: "npx",
        demoServerArgs: ["tsx", path.resolve("packages/demo-mcp-server/src/index.ts")],
        cloudUrl: CLOUD_URL,
        workspaceId: WORKSPACE_ID,
        upstreamId: UPSTREAM_ID,
        agentKey: AGENT_KEY,
        invocationLogFile: "/tmp/demo-mcp-invocations.json",
        verbose: VERBOSE,
    });
    // Run base scenarios (don't require cloud state manipulation)
    const results = await runner.runScenarios(BASE_SCENARIOS);
    // Exit with error if any failed
    const failed = results.filter((r) => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=run-scenarios.js.map