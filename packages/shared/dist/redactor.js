"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactArgs = redactArgs;
exports.sanitizeCommand = sanitizeCommand;
/**
 * Redaction Policy
 *
 * NEVER store or send to cloud:
 * - email/message bodies
 * - attachment or file contents
 * - auth headers, tokens, cookies, passwords, API keys
 * - raw scraped page content
 * - full command output
 *
 * ALLOWED to store/send:
 * - tool name
 * - extracted metadata (domain, recipient domain, URL host/path)
 * - booleans (has_attachment, external_domain, form_submit)
 * - counts
 * - hashes (args_hash, request_hash)
 */
// Keys that should NEVER be stored/sent
const SENSITIVE_KEY_PATTERNS = [
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
/**
 * Check if a key name indicates sensitive content
 */
function isSensitiveKey(key) {
    const lowerKey = key.toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some((sensitive) => lowerKey === sensitive ||
        lowerKey.includes(sensitive) ||
        lowerKey.endsWith(`_${sensitive}`) ||
        lowerKey.startsWith(`${sensitive}_`));
}
/**
 * Check if a value looks like it contains sensitive content
 */
function isSensitiveValue(value) {
    if (typeof value !== "string")
        return false;
    // Long strings are likely content bodies
    if (value.length > 500)
        return true;
    // Looks like a token/key (long alphanumeric string)
    if (/^[A-Za-z0-9_-]{32,}$/.test(value))
        return true;
    // Looks like base64 encoded content
    if (value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value))
        return true;
    // Looks like HTML content
    if (value.includes("<html") ||
        value.includes("<body") ||
        value.includes("<!DOCTYPE")) {
        return true;
    }
    return false;
}
/**
 * Extract safe metadata from a value
 */
function extractSafeMetadata(key, value) {
    const metadata = {};
    if (typeof value === "string") {
        // Extract URL components
        if (value.startsWith("http://") || value.startsWith("https://")) {
            try {
                const url = new URL(value);
                metadata[`${key}_host`] = url.hostname;
                metadata[`${key}_path`] = url.pathname;
                return { redacted: `[URL:${url.hostname}]`, metadata };
            }
            catch {
                // Not a valid URL
            }
        }
        // Extract email domain
        if (value.includes("@") && !value.includes(" ")) {
            const parts = value.split("@");
            if (parts.length === 2 && parts[1]) {
                metadata[`${key}_domain`] = parts[1].toLowerCase();
                return { redacted: `[EMAIL:*@${parts[1].toLowerCase()}]`, metadata };
            }
        }
        // Long content - just note the length
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
/**
 * Redact sensitive information from tool call arguments
 *
 * @param args - The raw tool call arguments
 * @returns Redacted args safe for storage/transmission and extracted metadata
 */
function redactArgs(args) {
    if (!args || typeof args !== "object") {
        return { redacted: {}, metadata: {} };
    }
    const redacted = {};
    const metadata = {};
    function processValue(key, value) {
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
            const { redacted: redactedValue, metadata: valueMeta } = extractSafeMetadata(key, value);
            Object.assign(metadata, valueMeta);
            return redactedValue;
        }
        // Recursively process arrays (limit to first few items)
        if (Array.isArray(value)) {
            if (value.length > 10) {
                metadata[`${key}_count`] = value.length;
                return value.slice(0, 3).map((item, i) => processValue(`${key}[${i}]`, item));
            }
            return value.map((item, i) => processValue(`${key}[${i}]`, item));
        }
        // Recursively process objects
        if (typeof value === "object") {
            const processed = {};
            for (const [k, v] of Object.entries(value)) {
                processed[k] = processValue(k, v);
            }
            return processed;
        }
        // Safe to keep
        return value;
    }
    for (const [key, value] of Object.entries(args)) {
        // Skip approval token entirely
        if (key === "approvalToken")
            continue;
        redacted[key] = processValue(key, value);
    }
    return { redacted, metadata };
}
/**
 * Sanitize a command string for logging (remove potential secrets)
 */
function sanitizeCommand(command) {
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
//# sourceMappingURL=redactor.js.map