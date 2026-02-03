import crypto from "crypto";

/**
 * Create a SHA-256 hash of the input
 */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Create a deterministic hash of an object (for args_hash, request_hash)
 */
export function hashObject(obj: unknown): string {
  const normalized = JSON.stringify(obj, Object.keys(obj as object).sort());
  return sha256(normalized);
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Hash a token for storage (never store raw tokens)
 */
export function hashToken(token: string): string {
  return sha256(token);
}

/**
 * Create a request hash from tool call components
 */
export function createRequestHash(
  toolName: string,
  upstreamId: string,
  argsHash: string
): string {
  return sha256(`${toolName}:${upstreamId}:${argsHash}`);
}
