import { spawn } from "child_process";
import { MessageFramer } from "./message-framer.js";
import { CloudClient } from "./cloud-client.js";

type JsonRpcId = string | number;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pickResultTools(message: unknown): unknown[] | null {
  if (!isRecord(message)) return null;
  const result = message.result;
  if (!isRecord(result)) return null;
  const tools = result.tools;
  return Array.isArray(tools) ? (tools as unknown[]) : null;
}

export async function runSyncTools(options: {
  upstreamCommand: string;
  upstreamArgs: string[];
  cloudUrl: string;
  workspaceId: string;
  agentKey: string;
  upstreamId: string;
  timeoutMs: number;
}): Promise<void> {
  const cloud = new CloudClient({
    baseUrl: options.cloudUrl,
    workspaceId: options.workspaceId,
    agentKey: options.agentKey,
    upstreamId: options.upstreamId,
  });

  const upstream = spawn(options.upstreamCommand, options.upstreamArgs, {
    stdio: ["pipe", "pipe", "inherit"],
  });

  const framer = new MessageFramer();
  const pending = new Map<
    JsonRpcId,
    { resolve: (msg: unknown) => void; reject: (err: Error) => void }
  >();

  const killUpstream = () => {
    try {
      upstream.kill("SIGTERM");
    } catch {
      // ignore
    }
  };

  const timeoutHandle = setTimeout(() => {
    for (const { reject } of pending.values()) {
      reject(new Error("Timed out waiting for upstream response"));
    }
    pending.clear();
    killUpstream();
  }, options.timeoutMs);

  upstream.on("exit", (code, signal) => {
    if (pending.size > 0) {
      const err = new Error(`Upstream exited (code=${code}, signal=${signal})`);
      for (const { reject } of pending.values()) reject(err);
      pending.clear();
    }
  });

  upstream.on("error", (err) => {
    if (pending.size > 0) {
      for (const { reject } of pending.values()) reject(err);
      pending.clear();
    }
  });

  upstream.stdout?.on("data", (chunk) => {
    const messages = framer.push(chunk);
    for (const msg of messages) {
      if (!isRecord(msg)) continue;
      const id = msg.id;
      if (typeof id !== "string" && typeof id !== "number") continue;
      const waiter = pending.get(id);
      if (!waiter) continue;
      pending.delete(id);
      waiter.resolve(msg);
    }
  });

  const send = (message: unknown) => {
    upstream.stdin?.write(JSON.stringify(message) + "\n");
  };

  const request = (method: string, params: Record<string, unknown>): Promise<unknown> => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const msg = { jsonrpc: "2.0", id, method, params };
    send(msg);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  try {
    // Initialize (some servers require it before tools/list)
    await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "latch", version: "0.1.0" },
    });

    // Spec: client should notify initialized after initialize completes
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

    // List tools
    const toolsResp = await request("tools/list", {});
    const tools = pickResultTools(toolsResp);
    if (!tools) {
      throw new Error("Upstream did not return tools in tools/list response");
    }

    await cloud.syncTools(tools);
    console.error(`[latch] Synced ${tools.length} tools to dashboard.`);
  } finally {
    clearTimeout(timeoutHandle);
    killUpstream();
  }
}

