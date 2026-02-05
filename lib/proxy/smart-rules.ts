/**
 * Smart Rules - LLM-powered policy evaluation
 *
 * Evaluates tool calls against natural language conditions using an LLM.
 * This allows for flexible, human-readable security rules like:
 * - "Block searches targeting sensitive files like .env, passwords, SSH keys"
 * - "Require approval for any file operations outside the project directory"
 */

// Simple OpenAI-compatible API call
// Uses OPENAI_API_KEY env var, falls back to a basic heuristic if not set

interface SmartRuleEvaluation {
  matches: boolean;
  reason: string;
}

/**
 * Evaluate whether a tool call matches a natural language condition
 */
export async function evaluateSmartCondition(
  toolName: string,
  args: unknown,
  condition: string
): Promise<SmartRuleEvaluation> {
  const apiKey = process.env.OPENAI_API_KEY;

  // If no API key, fall back to keyword matching
  if (!apiKey) {
    return fallbackEvaluation(toolName, args, condition);
  }

  try {
    const prompt = buildPrompt(toolName, args, condition);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a security policy evaluator. Your job is to determine if a tool call matches a security condition.

Respond with a JSON object containing:
- "matches": boolean (true if the tool call matches/violates the condition)
- "reason": string (brief explanation)

Be security-conscious: when in doubt, err on the side of matching (blocking) to protect sensitive data.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      console.error("[smart-rules] OpenAI API error:", response.status);
      return fallbackEvaluation(toolName, args, condition);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return fallbackEvaluation(toolName, args, condition);
    }

    // Parse the JSON response
    const parsed = parseJsonResponse(content);
    return parsed ?? fallbackEvaluation(toolName, args, condition);
  } catch (error) {
    console.error("[smart-rules] Error evaluating condition:", error);
    return fallbackEvaluation(toolName, args, condition);
  }
}

function buildPrompt(
  toolName: string,
  args: unknown,
  condition: string
): string {
  const argsStr = JSON.stringify(args, null, 2);

  return `Evaluate if this tool call matches the security condition.

**Tool:** ${toolName}

**Arguments:**
\`\`\`json
${argsStr}
\`\`\`

**Security Condition:**
${condition}

Does this tool call match the condition? Respond with JSON: {"matches": true/false, "reason": "..."}`;
}

function parseJsonResponse(content: string): SmartRuleEvaluation | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.matches !== "boolean") return null;

    return {
      matches: parsed.matches,
      reason: parsed.reason || "No reason provided",
    };
  } catch {
    return null;
  }
}

/**
 * Fallback evaluation using keyword matching when LLM is not available
 */
function fallbackEvaluation(
  toolName: string,
  args: unknown,
  condition: string
): SmartRuleEvaluation {
  const argsStr = JSON.stringify(args).toLowerCase();
  const conditionLower = condition.toLowerCase();

  // Extract keywords from the condition
  const sensitivePatterns = [
    // Files
    /\.env/i,
    /password/i,
    /secret/i,
    /credential/i,
    /api[_-]?key/i,
    /private[_-]?key/i,
    /\.ssh/i,
    /\.aws/i,
    /\.git/i,
    /\.npmrc/i,
    /\.netrc/i,
    // Paths
    /\/etc\//i,
    /\/root\//i,
    /\/home\/[^/]+\/\./i, // Hidden files in home dirs
    /~\/\./i, // Hidden files in home
    // Databases
    /database/i,
    /db_pass/i,
    /postgres/i,
    /mysql/i,
    /mongo/i,
  ];

  // Check if condition mentions sensitive patterns and args contain them
  const conditionMentionsSensitive = sensitivePatterns.some((p) =>
    p.test(conditionLower)
  );

  if (conditionMentionsSensitive) {
    // Check if args contain any sensitive patterns
    for (const pattern of sensitivePatterns) {
      if (pattern.test(argsStr)) {
        return {
          matches: true,
          reason: `Arguments contain sensitive pattern matching condition (fallback evaluation)`,
        };
      }
    }
  }

  // Generic keyword extraction from condition
  const conditionKeywords = conditionLower
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !["block", "deny", "alert", "require", "approval", "when", "that", "this", "like", "such", "files", "targeting"].includes(w));

  for (const keyword of conditionKeywords) {
    if (argsStr.includes(keyword)) {
      return {
        matches: true,
        reason: `Arguments contain keyword "${keyword}" from condition (fallback evaluation)`,
      };
    }
  }

  return {
    matches: false,
    reason: "No match found (fallback evaluation)",
  };
}
