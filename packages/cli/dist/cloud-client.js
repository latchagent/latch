/**
 * Client for communicating with the Latch Cloud API
 */
export class CloudClient {
    baseUrl;
    workspaceId;
    agentKey;
    upstreamId;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
        this.workspaceId = options.workspaceId;
        this.agentKey = options.agentKey;
        this.upstreamId = options.upstreamId;
    }
    /**
     * Call the /api/v1/authorize endpoint
     *
     * This is the single entry point for policy decisions.
     * It handles:
     * - Fresh requests: evaluates policy, creates approval request if needed
     * - Retry with token: validates and consumes token atomically
     */
    async authorize(request) {
        const url = `${this.baseUrl}/api/v1/authorize`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Latch-Agent-Key": this.agentKey,
            },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Authorization failed: ${response.status} ${errorText}`);
        }
        return response.json();
    }
    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`);
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Poll for approval status
     * Returns the token if approved, null if still pending, throws if denied/expired
     */
    async pollApprovalStatus(approvalRequestId) {
        const url = `${this.baseUrl}/api/v1/approval-status?approval_request_id=${approvalRequestId}`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-Latch-Agent-Key": this.agentKey,
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to poll approval status: ${response.status} ${errorText}`);
        }
        return response.json();
    }
    /**
     * Wait for approval with polling
     * Polls every `intervalMs` until approved, denied, or `timeoutMs` is reached
     */
    async waitForApproval(approvalRequestId, timeoutMs = 300000, // 5 minutes default
    intervalMs = 2000 // 2 seconds default
    ) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const status = await this.pollApprovalStatus(approvalRequestId);
            if (status.status === "approved" && status.token) {
                return { approved: true, token: status.token };
            }
            if (status.status === "denied") {
                return { approved: false, reason: "Request was denied" };
            }
            if (status.status === "expired") {
                return { approved: false, reason: "Request expired" };
            }
            // Still pending, wait and poll again
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return { approved: false, reason: "Timeout waiting for approval" };
    }
}
//# sourceMappingURL=cloud-client.js.map