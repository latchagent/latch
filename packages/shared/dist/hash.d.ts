/**
 * Canonical Hashing for Latch
 *
 * CRITICAL: This module defines the canonical hashing functions used by both
 * the CLI and Cloud. Any change here affects token validation security.
 *
 * Rules:
 * 1. Always use SHA-256
 * 2. JSON normalization: sorted keys, no whitespace
 * 3. Remove approvalToken before hashing args
 * 4. args_hash = hash of normalized args
 * 5. request_hash = hash of "tool_name:upstream_id:args_hash"
 */
/**
 * Create a SHA-256 hash of the input
 */
export declare function sha256(input: string): string;
/**
 * Normalize an object for hashing
 * - Sorts keys recursively
 * - Removes undefined values
 * - Produces deterministic JSON string
 */
export declare function normalizeForHashing(obj: unknown): string;
/**
 * Prepare args for hashing by removing the approval token
 */
export declare function prepareArgsForHashing(args: Record<string, unknown> | undefined): Record<string, unknown>;
/**
 * Compute the canonical args_hash
 *
 * @param args - The tool call arguments (will have approvalToken removed)
 * @returns SHA-256 hash of normalized args
 */
export declare function computeArgsHash(args: Record<string, unknown> | undefined): string;
/**
 * Compute the canonical request_hash
 *
 * The request_hash uniquely identifies a specific tool call request.
 * It's used to bind approval tokens to the exact request.
 *
 * @param toolName - The MCP tool name
 * @param upstreamId - The upstream server ID
 * @param argsHash - The args_hash (computed via computeArgsHash)
 * @returns SHA-256 hash of "tool_name:upstream_id:args_hash"
 */
export declare function computeRequestHash(toolName: string, upstreamId: string, argsHash: string): string;
/**
 * Generate a secure random token
 */
export declare function generateSecureToken(bytes?: number): string;
/**
 * Hash a token for storage (never store raw tokens)
 */
export declare function hashToken(token: string): string;
//# sourceMappingURL=hash.d.ts.map