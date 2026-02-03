import type { RedactionResult } from "./types.js";
/**
 * Redact sensitive information from tool call arguments
 *
 * @param args - The raw tool call arguments
 * @returns Redacted args safe for storage/transmission and extracted metadata
 */
export declare function redactArgs(args: unknown): RedactionResult;
/**
 * Sanitize a command string for logging (remove potential secrets)
 */
export declare function sanitizeCommand(command: string): string;
//# sourceMappingURL=redactor.d.ts.map