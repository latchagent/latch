import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function safeJson(x) {
  try {
    return JSON.stringify(x);
  } catch {
    return "[unserializable]";
  }
}

function expandTilde(p) {
  if (!p) return p;
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

async function appendLine(filePath, line) {
  try {
    const p = expandTilde(filePath);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, line + "\n", "utf8");
  } catch {
    // ignore
  }
}

async function authorize({ baseUrl, agentKey, body }) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/authorize`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Latch-Agent-Key": agentKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Latch authorize failed: ${res.status} ${t}`);
  }
  return res.json();
}

async function pollApprovalStatus({ baseUrl, agentKey, approvalRequestId }) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/approval-status?approval_request_id=${approvalRequestId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Latch-Agent-Key": agentKey,
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Latch approval-status failed: ${res.status} ${t}`);
  }
  return res.json();
}

async function waitForApproval({ baseUrl, agentKey, approvalRequestId, timeoutMs }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await pollApprovalStatus({ baseUrl, agentKey, approvalRequestId });
    if (status.status === "approved" && status.token) return { approved: true, token: status.token };
    if (status.status === "denied") return { approved: false, reason: "denied" };
    if (status.status === "expired") return { approved: false, reason: "expired" };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { approved: false, reason: "timeout" };
}

// Minimal classification for native OpenClaw tools (we’ll refine later)
function classifyOpenClawToolCall(toolName, params) {
  const n = String(toolName || "").toLowerCase();
  if (n === "read" || n === "memory_get" || n === "memory_search" || n === "sessions_list" || n === "sessions_history") {
    return { action_class: "read", risk_level: "low" };
  }
  if (n === "browser") {
    const action = String(params?.action || "").toLowerCase();
    const risky = ["act", "navigate", "upload", "fill", "type", "press", "click", "dialog"].includes(action);
    return { action_class: risky ? "submit" : "read", risk_level: risky ? "high" : "med" };
  }
  if (n === "message") return { action_class: "send", risk_level: "high" };
  if (n === "exec" || n === "nodes") return { action_class: "execute", risk_level: "critical" };
  return { action_class: "write", risk_level: "med" };
}

export default {
  id: "openclaw-latch-guard",
  name: "Latch Guard",
  description: "Enforce Latch policies on OpenClaw native + MCP tool calls via before_tool_call.",
  register(api) {
    const cfg = api.pluginConfig ?? {};
    const logFile = cfg.logFile || "~/.openclaw/workspace/latch-guard-toolcalls.log";

    appendLine(logFile, `[${new Date().toISOString()}] plugin_loaded openclaw-latch-guard`).catch(() => {});

    api.on(
      "before_tool_call",
      async (event, ctx) => {
        const toolName = event?.toolName ?? "(unknown)";
        const params = event?.params ?? {};

        const mode = cfg.mode || "enforce";
        if (mode === "monitor") {
          await appendLine(logFile, `[${new Date().toISOString()}] monitor tool=${toolName} params=${safeJson(params)}`);
          return undefined;
        }

        const baseUrl = cfg.baseUrl || "http://localhost:3000";
        const workspaceId = cfg.workspaceId;
        const upstreamId = cfg.upstreamId;
        const agentKey = cfg.agentKey;
        const wait = cfg.waitForApproval !== false;
        const timeoutMs = (cfg.approvalTimeoutSeconds || 300) * 1000;

        if (!workspaceId || !upstreamId || !agentKey) {
          return {
            block: true,
            blockReason: "Latch Guard misconfigured: missing workspaceId/upstreamId/agentKey",
          };
        }

        const { action_class, risk_level } = classifyOpenClawToolCall(toolName, params);

        // We do not have redaction/hashing wired yet; keep payload minimal.
        // NOTE: args_redacted intentionally includes only high-level metadata.
        const req = {
          workspace_id: workspaceId,
          agent_key: agentKey,
          upstream_id: upstreamId,
          tool_name: `openclaw:${toolName}`,
          action_class,
          risk_level,
          risk_flags: {
            external_domain: false,
            new_recipient: false,
            attachment: false,
            form_submit: action_class === "submit",
            shell_exec: toolName === "exec" || toolName === "nodes",
            destructive: false,
          },
          resource: {},
          args_hash: "openclaw-v0",
          request_hash: "openclaw-v0",
          args_redacted: {
            tool: toolName,
            // keep params shallow; we can add a real redactor next
            action: params?.action,
          },
        };

        try {
          const out = await authorize({ baseUrl, agentKey, body: req });

          if (out.decision === "allowed") {
            return undefined;
          }

          if (out.decision === "denied") {
            return { block: true, blockReason: `Latch denied: ${out.reason}` };
          }

          if (out.decision === "approval_required") {
            if (!wait || !out.approval_request_id) {
              return { block: true, blockReason: `Latch approval required: ${out.reason}` };
            }

            await appendLine(logFile, `[${new Date().toISOString()}] waiting approval ${out.approval_request_id}`);
            const res = await waitForApproval({
              baseUrl,
              agentKey,
              approvalRequestId: out.approval_request_id,
              timeoutMs,
            });

            if (!res.approved || !res.token) {
              return { block: true, blockReason: `Latch approval failed: ${res.reason || "unknown"}` };
            }

            // Retry authorize with token
            const retry = { ...req, approval_token: res.token };
            const out2 = await authorize({ baseUrl, agentKey, body: retry });
            if (out2.decision === "allowed") {
              return undefined;
            }
            return { block: true, blockReason: `Latch retry denied: ${out2.reason}` };
          }

          return { block: true, blockReason: `Latch unexpected decision: ${out.decision}` };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx?.logger?.warn?.(`latch-guard authorize error: ${msg}`);
          return { block: true, blockReason: `Latch error: ${msg}` };
        }
      },
      { priority: 100 }
    );
  },
};
