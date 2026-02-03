/**
 * Redaction policy for persisting tool call arguments
 *
 * NEVER store:
 * - email/message bodies
 * - attachment or file contents
 * - auth headers, tokens, cookies, passwords, API keys
 * - raw scraped page content
 * - full command output
 *
 * ALLOWED:
 * - tool name
 * - extracted metadata (domain, recipient domain, URL host/path)
 * - booleans (has_attachment, external_domain, form_submit)
 * - counts
 * - hashes (args_hash, request_hash)
 */

// Keys that should NEVER be stored
const SENSITIVE_KEYS = [
  // Auth
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "api-key",
  "auth",
  "authorization",
  "bearer",
  "cookie",
  "session",
  "credential",
  "private_key",
  "privatekey",
  "access_token",
  "refresh_token",
  "jwt",
  // Content
  "body",
  "content",
  "message",
  "text",
  "html",
  "markdown",
  "data",
  "payload",
  "raw",
  // Files
  "file",
  "attachment",
  "base64",
  "binary",
  "buffer",
  "blob",
  "stream",
  // Scraped content
  "page_content",
  "scraped",
  "html_content",
  "innerhtml",
  "outerhtml",
  "textcontent",
  // Command output
  "stdout",
  "stderr",
  "output",
  "result",
  "response",
];

// Keys that are safe to keep (used for reference, not filtering)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SAFE_KEYS = [
  "url",
  "uri",
  "href",
  "path",
  "endpoint",
  "method",
  "to",
  "from",
  "recipient",
  "sender",
  "email", // Just the address, not content
  "subject", // Email subject only
  "name",
  "id",
  "type",
  "action",
  "command", // Command name only
  "tool",
  "status",
  "code",
  "count",
  "limit",
  "offset",
  "page",
  "size",
  "enabled",
  "disabled",
  "flag",
  "option",
  "setting",
];

/**
 * Check if a key name indicates sensitive content
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some(
    (sensitive) =>
      lowerKey === sensitive ||
      lowerKey.includes(sensitive) ||
      lowerKey.endsWith(`_${sensitive}`) ||
      lowerKey.startsWith(`${sensitive}_`)
  );
}

/**
 * Check if a value looks like it contains sensitive content
 */
function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;

  // Long strings are likely content bodies
  if (value.length > 500) return true;

  // Looks like a token/key
  if (/^[A-Za-z0-9_-]{32,}$/.test(value)) return true;

  // Looks like base64 encoded content
  if (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value)) return true;

  // Looks like HTML content
  if (value.includes("<html") || value.includes("<body") || value.includes("<!DOCTYPE")) {
    return true;
  }

  return false;
}

/**
 * Extract safe metadata from a value
 */
function extractSafeMetadata(
  key: string,
  value: unknown
): { redacted: unknown; metadata: Record<string, unknown> } {
  const metadata: Record<string, unknown> = {};

  if (typeof value === "string") {
    // Extract URL components
    if (value.startsWith("http://") || value.startsWith("https://")) {
      try {
        const url = new URL(value);
        metadata[`${key}_host`] = url.hostname;
        metadata[`${key}_path`] = url.pathname;
        return { redacted: `[URL:${url.hostname}]`, metadata };
      } catch {
        // Not a valid URL
      }
    }

    // Extract email domain
    if (value.includes("@") && !value.includes(" ")) {
      const parts = value.split("@");
      if (parts.length === 2) {
        metadata[`${key}_domain`] = parts[1].toLowerCase();
        return { redacted: `[EMAIL:*@${parts[1].toLowerCase()}]`, metadata };
      }
    }

    // Long content
    if (value.length > 200) {
      metadata[`${key}_length`] = value.length;
      return { redacted: `[REDACTED:${value.length} chars]`, metadata };
    }
  }

  if (Array.isArray(value)) {
    metadata[`${key}_count`] = value.length;
    return { redacted: `[ARRAY:${value.length} items]`, metadata };
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    metadata[`${key}_keys`] = keys.slice(0, 5);
    return { redacted: `[OBJECT:${keys.length} keys]`, metadata };
  }

  return { redacted: value, metadata };
}

export interface RedactionResult {
  redacted: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * Redact sensitive information from tool call arguments
 */
export function redactArgs(args: unknown): RedactionResult {
  if (!args || typeof args !== "object") {
    return { redacted: {}, metadata: {} };
  }

  const redacted: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};

  function processValue(
    key: string,
    value: unknown
  ): unknown {
    // Skip null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Check if key is sensitive
    if (isSensitiveKey(key)) {
      const { metadata: valueMeta } = extractSafeMetadata(key, value);
      Object.assign(metadata, valueMeta);
      return "[REDACTED]";
    }

    // Check if value looks sensitive
    if (isSensitiveValue(value)) {
      const { redacted: redactedValue, metadata: valueMeta } = extractSafeMetadata(
        key,
        value
      );
      Object.assign(metadata, valueMeta);
      return redactedValue;
    }

    // Recursively process objects
    if (Array.isArray(value)) {
      // Only process first few items to prevent explosion
      if (value.length > 10) {
        metadata[`${key}_count`] = value.length;
        return value.slice(0, 3).map((item, i) => processValue(`${key}[${i}]`, item));
      }
      return value.map((item, i) => processValue(`${key}[${i}]`, item));
    }

    if (typeof value === "object") {
      const processed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        processed[k] = processValue(k, v);
      }
      return processed;
    }

    // Safe to keep
    return value;
  }

  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    redacted[key] = processValue(key, value);
  }

  return { redacted, metadata };
}

/**
 * Sanitize a command for logging (remove potential secrets)
 */
export function sanitizeCommand(command: string): string {
  // Remove potential inline secrets
  let sanitized = command;

  // Hide values after common secret patterns
  const patterns = [
    /(-{1,2}(?:password|passwd|secret|token|key|auth)[=\s]+)('[^']*'|"[^"]*"|\S+)/gi,
    /((?:PASSWORD|PASSWD|SECRET|TOKEN|KEY|AUTH|API_KEY)=)('[^']*'|"[^"]*"|\S+)/gi,
    /(Bearer\s+)\S+/gi,
  ];

  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, "$1[REDACTED]");
  }

  // Truncate very long commands
  if (sanitized.length > 500) {
    return sanitized.substring(0, 500) + "... [TRUNCATED]";
  }

  return sanitized;
}
