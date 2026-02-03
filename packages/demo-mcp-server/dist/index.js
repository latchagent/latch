#!/usr/bin/env node
/**
 * Latch Demo MCP Server
 *
 * A deterministic MCP server with tools that cover all action classes.
 * Logs all invocations to stderr for test assertions.
 *
 * Tools:
 * - notes_read (READ) - Read a note
 * - file_write (WRITE) - Write to a file
 * - email_send (SEND) - Send an email
 * - shell_exec (EXECUTE) - Execute a command
 * - form_submit (SUBMIT) - Submit a form
 * - payment_send (TRANSFER_VALUE) - Send a payment
 *
 * Each tool logs its invocation and returns a predictable response.
 */
import * as readline from "readline";
import * as fs from "fs";
// Invocation log file (for test assertions)
const LOG_FILE = process.env.DEMO_MCP_LOG_FILE || "/tmp/demo-mcp-invocations.json";
const invocations = [];
function logInvocation(tool, args) {
    const invocation = {
        timestamp: new Date().toISOString(),
        tool,
        args,
    };
    invocations.push(invocation);
    // Write to log file for test assertions
    fs.writeFileSync(LOG_FILE, JSON.stringify(invocations, null, 2));
    // Also log to stderr
    console.error(`[demo-mcp] INVOKED: ${tool}`, JSON.stringify(args).slice(0, 100));
}
function getInvocationCount(tool) {
    if (tool) {
        return invocations.filter((i) => i.tool === tool).length;
    }
    return invocations.length;
}
// Tool definitions
const TOOLS = [
    {
        name: "notes_read",
        description: "Read a note by ID (READ action class)",
        inputSchema: {
            type: "object",
            properties: {
                noteId: { type: "string", description: "Note ID to read" },
            },
            required: ["noteId"],
        },
    },
    {
        name: "file_write",
        description: "Write content to a file (WRITE action class)",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "File path" },
                content: { type: "string", description: "File content" },
            },
            required: ["path", "content"],
        },
    },
    {
        name: "email_send",
        description: "Send an email (SEND action class)",
        inputSchema: {
            type: "object",
            properties: {
                to: { type: "string", description: "Recipient email address" },
                subject: { type: "string", description: "Email subject" },
                body: { type: "string", description: "Email body" },
            },
            required: ["to", "subject", "body"],
        },
    },
    {
        name: "shell_exec",
        description: "Execute a shell command (EXECUTE action class)",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string", description: "Shell command to execute" },
                cwd: { type: "string", description: "Working directory" },
            },
            required: ["command"],
        },
    },
    {
        name: "form_submit",
        description: "Submit a form to a URL (SUBMIT action class)",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string", description: "Form action URL" },
                method: { type: "string", description: "HTTP method", default: "POST" },
                data: { type: "object", description: "Form data" },
            },
            required: ["url", "data"],
        },
    },
    {
        name: "payment_send",
        description: "Send a payment (TRANSFER_VALUE action class)",
        inputSchema: {
            type: "object",
            properties: {
                to: { type: "string", description: "Recipient identifier" },
                amount: { type: "number", description: "Amount to send" },
                currency: { type: "string", description: "Currency code", default: "USD" },
                memo: { type: "string", description: "Payment memo" },
            },
            required: ["to", "amount"],
        },
    },
    {
        name: "_test_getInvocations",
        description: "Test helper: get invocation count",
        inputSchema: {
            type: "object",
            properties: {
                tool: { type: "string", description: "Filter by tool name" },
            },
        },
    },
    {
        name: "_test_reset",
        description: "Test helper: reset invocation log",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
];
// Tool handlers
function handleToolCall(name, args) {
    switch (name) {
        case "notes_read": {
            logInvocation(name, args);
            const noteId = args.noteId;
            return {
                success: true,
                result: {
                    noteId,
                    content: `This is the content of note ${noteId}`,
                    createdAt: "2024-01-01T00:00:00Z",
                },
            };
        }
        case "file_write": {
            logInvocation(name, args);
            const path = args.path;
            const content = args.content;
            return {
                success: true,
                result: {
                    path,
                    bytesWritten: content.length,
                    message: `Successfully wrote ${content.length} bytes to ${path}`,
                },
            };
        }
        case "email_send": {
            logInvocation(name, args);
            const to = args.to;
            const subject = args.subject;
            return {
                success: true,
                result: {
                    messageId: `msg_${Date.now()}`,
                    to,
                    subject,
                    status: "sent",
                },
            };
        }
        case "shell_exec": {
            logInvocation(name, args);
            const command = args.command;
            return {
                success: true,
                result: {
                    command,
                    exitCode: 0,
                    stdout: `Executed: ${command}\nOutput: success`,
                    stderr: "",
                },
            };
        }
        case "form_submit": {
            logInvocation(name, args);
            const url = args.url;
            const data = args.data;
            return {
                success: true,
                result: {
                    url,
                    status: 200,
                    response: { success: true, submittedFields: Object.keys(data || {}) },
                },
            };
        }
        case "payment_send": {
            logInvocation(name, args);
            const to = args.to;
            const amount = args.amount;
            const currency = args.currency || "USD";
            return {
                success: true,
                result: {
                    transactionId: `txn_${Date.now()}`,
                    to,
                    amount,
                    currency,
                    status: "completed",
                },
            };
        }
        case "_test_getInvocations": {
            const tool = args.tool;
            return {
                success: true,
                result: {
                    count: getInvocationCount(tool),
                    invocations: tool
                        ? invocations.filter((i) => i.tool === tool)
                        : invocations,
                },
            };
        }
        case "_test_reset": {
            invocations.length = 0;
            fs.writeFileSync(LOG_FILE, "[]");
            return {
                success: true,
                result: { message: "Invocation log reset" },
            };
        }
        default:
            return {
                success: false,
                error: `Unknown tool: ${name}`,
            };
    }
}
// JSON-RPC message handling
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
function sendResponse(response) {
    console.log(JSON.stringify(response));
}
function handleRequest(request) {
    const { id, method, params } = request;
    console.error(`[demo-mcp] Received method: ${method}`);
    switch (method) {
        case "initialize":
            sendResponse({
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2024-11-05",
                    capabilities: {
                        tools: {},
                    },
                    serverInfo: {
                        name: "latch-demo-mcp",
                        version: "1.0.0",
                    },
                },
            });
            break;
        case "tools/list":
            sendResponse({
                jsonrpc: "2.0",
                id,
                result: {
                    tools: TOOLS,
                },
            });
            break;
        case "tools/call": {
            const p = params;
            const toolName = p?.name;
            const args = p?.arguments || {};
            const result = handleToolCall(toolName, args);
            if (result.success) {
                sendResponse({
                    jsonrpc: "2.0",
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result.result, null, 2),
                            },
                        ],
                    },
                });
            }
            else {
                sendResponse({
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: -32602,
                        message: result.error || "Tool execution failed",
                    },
                });
            }
            break;
        }
        case "notifications/initialized":
            console.error("[demo-mcp] Client initialized");
            break;
        default:
            if (id !== undefined) {
                sendResponse({
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`,
                    },
                });
            }
    }
}
// Message buffering for proper JSON-RPC framing
let buffer = "";
rl.on("line", (line) => {
    buffer += line;
    try {
        const request = JSON.parse(buffer);
        buffer = "";
        handleRequest(request);
    }
    catch {
        // Incomplete JSON, wait for more data
        buffer += "\n";
    }
});
rl.on("close", () => {
    console.error("[demo-mcp] Connection closed");
    process.exit(0);
});
// Handle signals
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
console.error("[demo-mcp] Server started");
console.error(`[demo-mcp] Logging invocations to: ${LOG_FILE}`);
//# sourceMappingURL=index.js.map