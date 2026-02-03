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
export declare function runBridge(options: BridgeOptions): Promise<void>;
