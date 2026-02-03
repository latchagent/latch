import { EventEmitter } from "events";
/**
 * MCP Client for Testing
 *
 * Spawns a process, sends JSON-RPC messages via stdin, and reads responses from stdout.
 * Implements proper message framing (buffered JSON parsing).
 */
export interface MCPClientOptions {
    command: string;
    args: string[];
    env?: Record<string, string>;
    timeout?: number;
    cwd?: string;
}
export interface MCPRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: unknown;
}
export interface MCPResponse {
    jsonrpc: "2.0";
    id: string | number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export declare class MCPClient extends EventEmitter {
    private process;
    private buffer;
    private pendingRequests;
    private requestId;
    private options;
    private stderr;
    constructor(options: MCPClientOptions);
    /**
     * Start the MCP server process
     */
    start(): Promise<void>;
    /**
     * Handle incoming data with proper message framing
     */
    private handleData;
    /**
     * Handle a parsed response
     */
    private handleResponse;
    /**
     * Send a request and wait for response
     */
    request(method: string, params?: unknown): Promise<MCPResponse>;
    /**
     * Send a notification (no response expected)
     */
    notify(method: string, params?: unknown): void;
    /**
     * Stop the process
     */
    stop(): Promise<void>;
    /**
     * Get captured stderr output
     */
    getStderr(): string[];
    /**
     * Check if process is running
     */
    isRunning(): boolean;
}
/**
 * Helper to create an MCP client for the Latch CLI
 */
export declare function createLatchClient(options: {
    cloudUrl: string;
    workspaceId: string;
    upstreamId: string;
    agentKey: string;
    upstreamCommand: string;
    upstreamArgs: string[];
    offline?: boolean;
    cwd?: string;
}): MCPClient;
