import "dotenv/config";

type Json = Record<string, unknown>;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function fetchJson(url: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: Json;
  try {
    const parsed = text ? (JSON.parse(text) as unknown) : {};
    json = (parsed && typeof parsed === "object" ? (parsed as Json) : ({ value: parsed } as Json));
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const baseUrl = process.env.LATCH_BASE_URL || "http://localhost:3334";
  const seedRaw = process.env.LATCH_TEST_SEED;
  if (!seedRaw) throw new Error("LATCH_TEST_SEED env var missing (expected JSON from seed-test.ts)");
  const seed = JSON.parse(seedRaw) as Record<string, unknown>;

  const agentKey = seed.agentKey as string;
  const workspaceId = seed.workspaceId as string;
  const upstreamIdOpenClaw = seed.upstreamIdOpenClaw as string;

  console.log("Running API smoke tests against", baseUrl);

  // 1) OpenClaw browser to linkedin should require approval
  const authorizeReq = {
    workspace_id: workspaceId,
    agent_key: agentKey,
    upstream_id: upstreamIdOpenClaw,
    tool_name: "openclaw:browser",
    action_class: "submit",
    risk_level: "high",
    risk_flags: {
      external_domain: true,
      new_recipient: false,
      attachment: false,
      form_submit: true,
      shell_exec: false,
      destructive: false,
    },
    resource: {
      urlHost: "www.linkedin.com",
      urlPath: "/in/christian-bryant-222723136/",
    },
    args_hash: "test-v0",
    request_hash: "test-v0",
    args_redacted: {
      action: "open",
      url: "https://www.linkedin.com/in/christian-bryant-222723136/",
    },
  };

  const out1 = await fetchJson(`${baseUrl}/api/v1/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Latch-Agent-Key": agentKey,
    },
    body: JSON.stringify(authorizeReq),
  });

  assert(out1.decision === "approval_required", `Expected approval_required, got ${out1.decision}`);
  assert(out1.approval_request_id, "Expected approval_request_id");

  console.log("✓ authorize linkedin => approval_required");

  // 2) Polling before approval should be pending
  const status1 = await fetchJson(
    `${baseUrl}/api/v1/approval-status?approval_request_id=${out1.approval_request_id}`,
    {
      headers: { "X-Latch-Agent-Key": agentKey },
    }
  );
  assert(status1.status === "pending", `Expected pending, got ${status1.status}`);
  console.log("✓ approval-status pending");

  // NOTE: We don't auto-approve here (would require calling internal approve APIs with auth).
  // This suite validates the policy decision + approval lifecycle endpoints are behaving.

  console.log("All smoke tests passed.");
}

main().catch((err) => {
  console.error("SMOKE TESTS FAILED:", err);
  process.exit(1);
});
