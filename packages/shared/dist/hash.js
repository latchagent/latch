"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256 = sha256;
exports.normalizeForHashing = normalizeForHashing;
exports.prepareArgsForHashing = prepareArgsForHashing;
exports.computeArgsHash = computeArgsHash;
exports.computeRequestHash = computeRequestHash;
exports.generateSecureToken = generateSecureToken;
exports.hashToken = hashToken;
const crypto_1 = require("crypto");
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
function sha256(input) {
    return (0, crypto_1.createHash)("sha256").update(input).digest("hex");
}
/**
 * Normalize an object for hashing
 * - Sorts keys recursively
 * - Removes undefined values
 * - Produces deterministic JSON string
 */
function normalizeForHashing(obj) {
    return JSON.stringify(obj, (_, value) => {
        if (value === undefined)
            return undefined;
        if (value === null)
            return null;
        if (typeof value !== "object" || Array.isArray(value))
            return value;
        // Sort object keys
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = value[key];
        }
        return sorted;
    });
}
/**
 * Prepare args for hashing by removing the approval token
 */
function prepareArgsForHashing(args) {
    if (!args)
        return {};
    // Clone and remove approvalToken
    const cleaned = { ...args };
    delete cleaned.approvalToken;
    return cleaned;
}
/**
 * Compute the canonical args_hash
 *
 * @param args - The tool call arguments (will have approvalToken removed)
 * @returns SHA-256 hash of normalized args
 */
function computeArgsHash(args) {
    const cleaned = prepareArgsForHashing(args);
    const normalized = normalizeForHashing(cleaned);
    return sha256(normalized);
}
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
function computeRequestHash(toolName, upstreamId, argsHash) {
    const input = `${toolName}:${upstreamId}:${argsHash}`;
    return sha256(input);
}
/**
 * Generate a secure random token
 */
function generateSecureToken(bytes = 32) {
    const { randomBytes } = require("crypto");
    return randomBytes(bytes).toString("hex");
}
/**
 * Hash a token for storage (never store raw tokens)
 */
function hashToken(token) {
    return sha256(token);
}
//# sourceMappingURL=hash.js.map