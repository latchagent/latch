import { NextRequest, NextResponse } from "next/server";
import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const ruleSchema = z.object({
  rules: z.array(
    z.object({
      effect: z.enum(["allow", "deny", "require_approval"]),
      action_class: z.enum(["read", "write", "send", "execute", "submit", "transfer_value", "any"]),
      tool_name: z.string().nullable().describe("Specific tool name to match, or null for any tool"),
      domain_match: z.string().nullable().describe("Domain pattern to match (e.g., 'github.com'), or null for any domain"),
      recipient_match: z.string().nullable().describe("Exact email address to match (e.g., 'alice@example.com'), or null for any recipient"),
      description: z.string().describe("Human-readable description of what this rule does"),
    })
  ),
  explanation: z.string().describe("Brief explanation of how these rules achieve the user's intent"),
});

const systemPrompt = `You are a security policy expert helping users create rules for an AI agent control system called Latch.

Latch intercepts tool calls from AI agents and enforces policies. Each rule has:
- effect: "allow" (let it through), "deny" (block it), or "require_approval" (human must approve)
- action_class: The type of action:
  - "read": Reading files, fetching data, queries
  - "write": Creating/modifying files, updating data
  - "send": Sending emails, messages, notifications
  - "execute": Running shell commands, scripts, code
  - "submit": Submitting forms, creating PRs, publishing
  - "transfer_value": Payments, transfers, financial actions
  - "any": Matches all action types
- tool_name: Specific tool to match (e.g., "shell.exec", "github.pr.create") or null for any
- domain_match: Domain pattern (e.g., "github.com", "*.internal.com") or null for any
- recipient_match: Exact email address (e.g., "alice@example.com") - use this when matching specific recipients

Rules are evaluated in priority order: deny rules first, then allow rules, then defaults.

When the user describes what they want, create the minimal set of rules needed. Be specific where possible.
Prefer "require_approval" over "deny" for risky but legitimate actions.
Use "any" action_class sparingly - be specific when you can infer the action type.
Use recipient_match when the user specifies an exact email address, use domain_match for entire domains.

Examples:
- "Let the agent read anything" → allow + read + any tool
- "Block shell commands" → deny + execute + tool_name: "shell.exec" (or similar)
- "Require approval for emails to external domains" → require_approval + send + domain not matching internal
- "Allow GitHub but require approval for merges" → allow + read + github.com, require_approval + submit + github.com
- "Allow emails to alice@example.com" → allow + send + recipient_match: "alice@example.com"`;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaces = await getUserWorkspaces(session.user.id);
    if (workspaces.length === 0) {
      return NextResponse.json({ error: "No workspace" }, { status: 400 });
    }

    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const result = await generateObject({
      model: openai("gpt-4o"),
      schema: ruleSchema,
      system: systemPrompt,
      prompt: `Create rules for this request: "${prompt}"`,
    });

    return NextResponse.json({
      rules: result.object.rules,
      explanation: result.object.explanation,
    });
  } catch (error) {
    console.error("Rule parse error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse rules" },
      { status: 500 }
    );
  }
}
