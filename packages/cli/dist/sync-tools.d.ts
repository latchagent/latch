export declare function runSyncTools(options: {
    upstreamCommand: string;
    upstreamArgs: string[];
    cloudUrl: string;
    workspaceId: string;
    agentKey: string;
    upstreamId: string;
    timeoutMs: number;
}): Promise<void>;
