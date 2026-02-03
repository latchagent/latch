import { spawn } from "child_process";
import { EventEmitter } from "events";
export class MCPClient extends EventEmitter {
    process = null;
    buffer = "";
    pendingRequests = new Map();
    requestId = 1;
    options;
    stderr = [];
    constructor(options) {
        super();
        this.options = {
            timeout: 30000,
            ...options,
        };
    }
    /**
     * Start the MCP server process
     */
    async start() {
        return new Promise((resolve, reject) => {
            const env = {
                ...process.env,
                ...this.options.env,
            };
            this.process = spawn(this.options.command, this.options.args, {
                stdio: ["pipe", "pipe", "pipe"],
                env,
                cwd: this.options.cwd,
            });
            this.process.on("error", (err) => {
                this.emit("error", err);
                reject(err);
            });
            this.process.on("exit", (code, signal) => {
                this.emit("exit", { code, signal });
                // Reject any pending requests
                for (const [id, pending] of this.pendingRequests) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error(`Process exited with code ${code}`));
                }
                this.pendingRequests.clear();
            });
            // Handle stdout (JSON-RPC responses)
            this.process.stdout?.on("data", (chunk) => {
                this.handleData(chunk);
            });
            // Capture stderr for debugging
            this.process.stderr?.on("data", (chunk) => {
                const line = chunk.toString();
                this.stderr.push(line);
                this.emit("stderr", line);
            });
            // Wait a bit for process to start
            setTimeout(() => resolve(), 100);
        });
    }
    /**
     * Handle incoming data with proper message framing
     */
    handleData(chunk) {
        this.buffer += chunk.toString("utf8");
        // Extract complete messages (newline-delimited JSON)
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);
            if (line.length === 0)
                continue;
            try {
                const message = JSON.parse(line);
                this.handleResponse(message);
            }
            catch (error) {
                this.emit("parseError", { line, error });
            }
        }
    }
    /**
     * Handle a parsed response
     */
    handleResponse(response) {
        this.emit("response", response);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
        }
    }
    /**
     * Send a request and wait for response
     */
    async request(method, params) {
        if (!this.process || this.process.killed) {
            throw new Error("Process not running");
        }
        const id = this.requestId++;
        const request = {
            jsonrpc: "2.0",
            id,
            method,
            params,
        };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout after ${this.options.timeout}ms`));
            }, this.options.timeout);
            this.pendingRequests.set(id, { resolve, reject, timeout });
            const data = JSON.stringify(request) + "\n";
            this.process?.stdin?.write(data);
            this.emit("request", request);
        });
    }
    /**
     * Send a notification (no response expected)
     */
    notify(method, params) {
        if (!this.process || this.process.killed) {
            throw new Error("Process not running");
        }
        const notification = {
            jsonrpc: "2.0",
            method,
            params,
        };
        const data = JSON.stringify(notification) + "\n";
        this.process.stdin?.write(data);
        this.emit("notification", notification);
    }
    /**
     * Stop the process
     */
    async stop() {
        const proc = this.process;
        if (!proc)
            return;
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                proc.kill("SIGKILL");
                resolve();
            }, 5000);
            proc.on("exit", () => {
                clearTimeout(timeout);
                resolve();
            });
            proc.stdin?.end();
            proc.kill("SIGTERM");
        });
    }
    /**
     * Get captured stderr output
     */
    getStderr() {
        return this.stderr;
    }
    /**
     * Check if process is running
     */
    isRunning() {
        return this.process !== null && !this.process.killed;
    }
}
/**
 * Helper to create an MCP client for the Latch CLI
 */
export function createLatchClient(options) {
    const args = [
        "run",
        "--upstream-command",
        options.upstreamCommand,
        "--upstream-args",
        options.upstreamArgs.join(","),
    ];
    if (options.offline) {
        args.push("--offline");
    }
    else {
        args.push("--cloud-url", options.cloudUrl);
        args.push("--workspace", options.workspaceId);
        args.push("--upstream-id", options.upstreamId);
        args.push("--agent-key", options.agentKey);
    }
    return new MCPClient({
        command: "node",
        args: [
            // Path to CLI - adjust as needed
            process.cwd() + "/packages/cli/dist/index.js",
            ...args,
        ],
        cwd: options.cwd || process.cwd(),
        timeout: 10000,
    });
}
//# sourceMappingURL=mcp-client.js.map