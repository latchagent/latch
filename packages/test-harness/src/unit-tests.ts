#!/usr/bin/env npx tsx

/**
 * Unit Tests for Latch Core Logic
 *
 * Tests the shared modules (classifier, hash, redactor) without spawning processes.
 */

import {
  classifyToolCall,
  computeArgsHash,
  computeRequestHash,
  redactArgs,
  getDefaultDecision,
} from "@latch/shared";

// Simple test framework
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error instanceof Error ? error.message : error}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message || "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(actual: boolean, message?: string): void {
  if (!actual) {
    throw new Error(message || "Expected true, got false");
  }
}

function assertFalse(actual: boolean, message?: string): void {
  if (actual) {
    throw new Error(message || "Expected false, got true");
  }
}

// ============================================
// Classifier Tests
// ============================================

console.log("\n=== Classifier Tests ===\n");

test("classifies read operations", () => {
  const result = classifyToolCall("notes_read", { noteId: "123" });
  assertEqual(result.actionClass, "read");
  assertEqual(result.riskLevel, "low");
});

test("classifies write operations", () => {
  const result = classifyToolCall("file_write", { path: "/tmp/test", content: "hello" });
  assertEqual(result.actionClass, "write");
});

test("classifies execute operations", () => {
  const result = classifyToolCall("shell_exec", { command: "ls -la" });
  assertEqual(result.actionClass, "execute");
  assertEqual(result.riskLevel, "high");
  assertTrue(result.riskFlags.shell_exec);
});

test("classifies submit operations", () => {
  const result = classifyToolCall("form_submit", { url: "https://example.com", data: {} });
  assertEqual(result.actionClass, "submit");
});

test("classifies send operations", () => {
  const result = classifyToolCall("email_send", {
    to: "user@gmail.com",
    subject: "Test",
    body: "Hello",
  });
  assertEqual(result.actionClass, "send");
  assertTrue(result.riskFlags.external_domain);
});

test("classifies transfer operations", () => {
  const result = classifyToolCall("payment_send", { to: "alice", amount: 100 });
  assertEqual(result.actionClass, "transfer_value");
  assertEqual(result.riskLevel, "critical");
});

test("detects destructive patterns", () => {
  const result = classifyToolCall("file.delete", { path: "/important" });
  assertTrue(result.riskFlags.destructive);
});

test("extracts domain from URL", () => {
  const result = classifyToolCall("fetch", { url: "https://api.example.com/data" });
  assertEqual(result.resource.urlHost, "api.example.com");
});

test("extracts domain from email", () => {
  const result = classifyToolCall("email_send", { to: "user@company.com" });
  assertEqual(result.resource.recipientDomain, "company.com");
});

test("detects internal domains", () => {
  const result = classifyToolCall("email_send", { to: "user@localhost" });
  assertFalse(result.riskFlags.external_domain);
});

// ============================================
// Hash Tests
// ============================================

console.log("\n=== Hash Tests ===\n");

test("computes consistent args hash", () => {
  const hash1 = computeArgsHash({ a: 1, b: 2 });
  const hash2 = computeArgsHash({ b: 2, a: 1 }); // Different order
  assertEqual(hash1, hash2, "Hash should be order-independent");
});

test("removes approvalToken before hashing", () => {
  const withToken = computeArgsHash({ command: "ls", approvalToken: "abc123" });
  const withoutToken = computeArgsHash({ command: "ls" });
  assertEqual(withToken, withoutToken, "Token should not affect hash");
});

test("computes request hash correctly", () => {
  const argsHash = computeArgsHash({ command: "ls" });
  const requestHash = computeRequestHash("shell.exec", "upstream-123", argsHash);
  assertTrue(requestHash.length === 64, "Should be SHA-256 hex");
});

test("different args produce different hashes", () => {
  const hash1 = computeArgsHash({ command: "ls" });
  const hash2 = computeArgsHash({ command: "rm" });
  assertTrue(hash1 !== hash2, "Different args should produce different hashes");
});

// ============================================
// Redactor Tests
// ============================================

console.log("\n=== Redactor Tests ===\n");

test("redacts password fields", () => {
  const result = redactArgs({ username: "alice", password: "secret123" });
  assertEqual(result.redacted.password, "[REDACTED]");
  assertEqual(result.redacted.username, "alice");
});

test("redacts token fields", () => {
  const result = redactArgs({ api_token: "sk-abc123", action: "fetch" });
  assertEqual(result.redacted.api_token, "[REDACTED]");
  assertEqual(result.redacted.action, "fetch");
});

test("redacts long content", () => {
  const longContent = "x".repeat(600);
  const result = redactArgs({ description: longContent }); // Use non-sensitive key
  assertTrue(
    (result.redacted.description as string).includes("[REDACTED:600 chars]"),
    "Should redact long content"
  );
});

test("fully redacts sensitive keys", () => {
  // Sensitive keys are fully redacted (no metadata extraction for security)
  const result = redactArgs({ auth: "https://api.example.com/v1/users" });
  assertEqual(result.redacted.auth, "[REDACTED]");
});

test("keeps safe values unchanged", () => {
  // Non-sensitive short values pass through unchanged
  const result = redactArgs({ action: "list", count: 5 });
  assertEqual(result.redacted.action, "list");
  assertEqual(result.redacted.count, 5);
});

test("removes approvalToken entirely", () => {
  const result = redactArgs({ command: "ls", approvalToken: "abc123" });
  assertFalse("approvalToken" in result.redacted);
});

// ============================================
// Default Decision Tests
// ============================================

console.log("\n=== Default Decision Tests ===\n");

test("READ defaults to allowed", () => {
  assertEqual(getDefaultDecision("read"), "allowed");
});

test("WRITE defaults to allowed", () => {
  assertEqual(getDefaultDecision("write"), "allowed");
});

test("EXECUTE defaults to approval_required", () => {
  assertEqual(getDefaultDecision("execute"), "approval_required");
});

test("SUBMIT defaults to approval_required", () => {
  assertEqual(getDefaultDecision("submit"), "approval_required");
});

test("TRANSFER_VALUE defaults to denied", () => {
  assertEqual(getDefaultDecision("transfer_value"), "denied");
});

test("SEND internal defaults to allowed", () => {
  assertEqual(
    getDefaultDecision("send", {
      external_domain: false,
      new_recipient: false,
      attachment: false,
      form_submit: false,
      shell_exec: false,
      destructive: false,
    }),
    "allowed"
  );
});

test("SEND external defaults to approval_required", () => {
  assertEqual(
    getDefaultDecision("send", {
      external_domain: true,
      new_recipient: false,
      attachment: false,
      form_submit: false,
      shell_exec: false,
      destructive: false,
    }),
    "approval_required"
  );
});

// ============================================
// Summary
// ============================================

console.log("\n=== Summary ===\n");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

process.exit(failed > 0 ? 1 : 0);
