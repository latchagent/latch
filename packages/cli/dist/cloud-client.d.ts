import type { AuthorizeRequest, AuthorizeResponse } from "@latchagent/shared";
export interface CloudClientOptions {
    baseUrl: string;
    workspaceId: string;
    agentKey: string;
    upstreamId: string;
}
/**
 * Client for communicating with the Latch Cloud API
 */
export declare class CloudClient {
    readonly baseUrl: string;
    readonly workspaceId: string;
    readonly agentKey: string;
    readonly upstreamId: string;
    constructor(options: CloudClientOptions);
    /**
     * Call the /api/v1/authorize endpoint
     *
     * This is the single entry point for policy decisions.
     * It handles:
     * - Fresh requests: evaluates policy, creates approval request if needed
     * - Retry with token: validates and consumes token atomically
     */
    authorize(request: AuthorizeRequest): Promise<AuthorizeResponse>;
    /**
     * Sync discovered tools to the cloud (for policy authoring UI).
     */
    syncTools(tools: unknown[]): Promise<void>;
    /**
     * Health check
     */
    healthCheck(): Promise<boolean>;
    /**
     * Poll for approval status
     * Returns the token if approved, null if still pending, throws if denied/expired
     */
    pollApprovalStatus(approvalRequestId: string): Promise<ApprovalStatusResponse>;
    /**
     * Wait for approval with polling
     * Polls every `intervalMs` until approved, denied, or `timeoutMs` is reached
     */
    waitForApproval(approvalRequestId: string, timeoutMs?: number, // 5 minutes default
    intervalMs?: number): Promise<{
        approved: boolean;
        token?: string;
        reason?: string;
    }>;
}
export interface ApprovalStatusResponse {
    status: "pending" | "approved" | "denied" | "expired";
    token?: string;
    token_available?: boolean;
    expires_at?: string;
    message?: string;
}
