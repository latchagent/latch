#!/usr/bin/env npx tsx

/**
 * Mock MCP Server for Testing Latch
 *
 * A simple MCP server that responds to any tool call with a success message.
 * Useful for testing the Latch CLI without a real MCP server.
 *
 * Usage:
 *   npx tsx scripts/mock-mcp-server.ts
 *
 * Or with Latch CLI:
 *   latch run --upstream-command "npx" --upstream-args "tsx,scripts/mock-mcp-server.ts" ...
 */

import * as readline from "readline";

// Available tools for testing different action classes
const TOOLS = [
  {
    name: "read_file",
    description: "Read a file (READ action)",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write to a file (WRITE action)",
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
    name: "send_email",
    description: "Send an email (SEND action)",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "execute_command",
    description: "Execute a shell command (EXECUTE action)",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command" },
      },
      required: ["command"],
    },
  },
  {
    name: "submit_form",
    description: "Submit a form (SUBMIT action)",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Form URL" },
        data: { type: "object", description: "Form data" },
      },
      required: ["url", "data"],
    },
  },
  {
    name: "transfer_money",
    description: "Transfer money (TRANSFER_VALUE action)",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient" },
        amount: { type: "number", description: "Amount" },
        currency: { type: "string", description: "Currency" },
      },
      required: ["to", "amount"],
    },
  },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(response: object): void {
  console.log(JSON.stringify(response));
}

function handleRequest(request: unknown): void {
  if (!request || typeof request !== "object") {
    return;
  }

  const { id, method, params } = request as Record<string, unknown>;
  if (typeof method !== "string") {
    return;
  }

  // Log to stderr so it doesn't interfere with stdout
  console.error(`[mock-mcp] Received: ${method}`);

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
            name: "mock-mcp-server",
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

    case "tools/call":
      const paramsObj =
        params && typeof params === "object" ? (params as Record<string, unknown>) : {};
      const toolName = typeof paramsObj.name === "string" ? paramsObj.name : undefined;
      const args =
        paramsObj.arguments && typeof paramsObj.arguments === "object"
          ? (paramsObj.arguments as Record<string, unknown>)
          : {};

      console.error(`[mock-mcp] Tool call: ${toolName}`, JSON.stringify(args).slice(0, 100));

      // Simulate successful execution
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `Mock response for ${toolName}: Success! Args: ${JSON.stringify(args)}`,
            },
          ],
        },
      });
      break;

    case "notifications/initialized":
      // No response needed for notifications
      console.error("[mock-mcp] Initialized");
      break;

    default:
      console.error(`[mock-mcp] Unknown method: ${method}`);
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

rl.on("line", (line) => {
  try {
    const request = JSON.parse(line);
    handleRequest(request);
  } catch (error) {
    console.error("[mock-mcp] Parse error:", error);
  }
});

rl.on("close", () => {
  console.error("[mock-mcp] Connection closed");
  process.exit(0);
});

console.error("[mock-mcp] Server started");
