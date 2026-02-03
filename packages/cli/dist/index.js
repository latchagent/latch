#!/usr/bin/env node
import { Command } from "commander";
import { runBridge } from "./bridge.js";
import { loadConfig, mergeWithEnv } from "./config.js";
import { runInit } from "./init.js";
const program = new Command();
const config = mergeWithEnv(loadConfig());
program
    .name("latch")
    .description("Latch CLI - MCP Guard Proxy for AI Agents")
    .version("0.1.0");
program
    .command("init")
    .description("Set up Latch CLI configuration")
    .action(async () => {
    await runInit();
});
program
    .command("run")
    .description("Run the Latch MCP bridge")
    .requiredOption("--upstream-command <command>", "Command to spawn the upstream MCP server")
    .option("--upstream-args <args>", "Comma-separated arguments for the upstream command", "")
    .option("--cloud-url <url>", "Latch dashboard URL", config.cloud_url)
    .option("--workspace <id>", "Workspace ID", config.workspace)
    .option("--agent-key <key>", "Agent key for authentication", config.agent_key)
    .option("--upstream-id <id>", "Upstream ID", config.upstream_id)
    .option("--offline", "Run in offline mode (local policy only)", false)
    .option("--wait-for-approval", "Wait and poll for approval", false)
    .option("--approval-timeout <seconds>", "Timeout for approval wait", "300")
    .action(async (options) => {
    const upstreamArgs = options.upstreamArgs
        ? options.upstreamArgs.split(",")
        : [];
    await runBridge({
        upstreamCommand: options.upstreamCommand,
        upstreamArgs,
        cloudUrl: options.cloudUrl,
        workspaceId: options.workspace,
        agentKey: options.agentKey,
        upstreamId: options.upstreamId,
        offline: options.offline,
        waitForApproval: options.waitForApproval,
        approvalTimeoutMs: parseInt(options.approvalTimeout) * 1000,
    });
});
program
    .command("version")
    .description("Print version information")
    .action(() => {
    console.log("Latch CLI v0.1.0");
});
program.parse();
//# sourceMappingURL=index.js.map