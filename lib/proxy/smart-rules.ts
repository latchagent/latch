/**
 * Smart Rules - LLM-powered policy evaluation
 *
 * Evaluates tool calls against natural language conditions using an LLM.
 * Uses Vercel AI SDK with structured output (Zod schema) for reliable responses.
 *
 * Examples:
 * - "Block searches targeting sensitive files like .env, passwords, SSH keys"
 * - "Require approval for any file operations outside the project directory"
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const smartRuleSchema = z.object({
  matches: z
    .boolean()
    .describe("True if the tool call matches/violates the security condition"),
  reason: z
    .string()
    .describe("Brief explanation of why the tool call does or does not match"),
});

export interface SmartRuleEvaluation {
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
    const argsStr = JSON.stringify(args, null, 2);

    const result = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: smartRuleSchema,
      system: `You are a security policy evaluator. Your job is to determine if a tool call matches a security condition.

Be security-conscious: when in doubt, err on the side of matching (blocking) to protect sensitive data.
Only match when the tool call is genuinely relevant to the condition. Do not match unrelated tool calls.`,
      prompt: `Evaluate if this tool call matches the security condition.

**Tool:** ${toolName}

**Arguments:**
\`\`\`json
${argsStr}
\`\`\`

**Security Condition:**
${condition}

Does this tool call match the condition?`,
      temperature: 0,
    });

    return {
      matches: result.object.matches,
      reason: result.object.reason,
    };
  } catch (error) {
    console.error("[smart-rules] Error evaluating condition:", error);
    return fallbackEvaluation(toolName, args, condition);
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
