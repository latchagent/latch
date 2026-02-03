/**
 * Test Scenarios for Latch
 *
 * Table-driven tests covering all major flows.
 */

export interface TestScenario {
  id: string;
  name: string;
  description: string;

  // What to send
  request: {
    method: string;
    params: unknown;
  };

  // Expected outcome
  expect: {
    // Response expectations
    success?: boolean; // If true, expect result; if false, expect error
    errorCode?: number; // Expected error code
    errorDataCode?: string; // Expected error.data.code (e.g., "APPROVAL_REQUIRED")

    // Upstream expectations
    upstreamInvoked?: boolean; // Whether upstream should have been called

    // Cloud expectations (for stateful tests)
    createsApprovalRequest?: boolean;
    consumesToken?: boolean;
  };

  // For multi-step scenarios
  setup?: {
    // Actions to run before this scenario
    approveFirst?: boolean; // Approve any pending requests first
    createLease?: {
      actionClass: string;
      durationMinutes: number;
    };
  };

  // For retry scenarios
  retryWith?: {
    // Modifications for retry
    useApprovalToken?: boolean;
    mutateArgs?: Record<string, unknown>;
    expiredToken?: boolean;
    reusedToken?: boolean;
  };
}

/**
 * Base test scenarios
 */
export const BASE_SCENARIOS: TestScenario[] = [
  // ============================================
  // 1. READ - Should be allowed by default
  // ============================================
  {
    id: "read-allowed",
    name: "READ action allowed",
    description: "READ tool calls should be allowed without approval",
    request: {
      method: "tools/call",
      params: {
        name: "notes_read",
        arguments: { noteId: "note-123" },
      },
    },
    expect: {
      success: true,
      upstreamInvoked: true,
    },
  },

  // ============================================
  // 2. WRITE - Should be allowed by default
  // ============================================
  {
    id: "write-allowed",
    name: "WRITE action allowed",
    description: "WRITE tool calls should be allowed without approval",
    request: {
      method: "tools/call",
      params: {
        name: "file_write",
        arguments: { path: "/tmp/test.txt", content: "hello world" },
      },
    },
    expect: {
      success: true,
      upstreamInvoked: true,
    },
  },

  // ============================================
  // 3. EXECUTE - Should require approval
  // ============================================
  {
    id: "execute-requires-approval",
    name: "EXECUTE requires approval",
    description: "EXECUTE tool calls should return APPROVAL_REQUIRED",
    request: {
      method: "tools/call",
      params: {
        name: "shell_exec",
        arguments: { command: "ls -la" },
      },
    },
    expect: {
      success: false,
      errorCode: -32001,
      errorDataCode: "APPROVAL_REQUIRED",
      upstreamInvoked: false,
      createsApprovalRequest: true,
    },
  },

  // ============================================
  // 4. SUBMIT - Should require approval
  // ============================================
  {
    id: "submit-requires-approval",
    name: "SUBMIT requires approval",
    description: "SUBMIT tool calls should return APPROVAL_REQUIRED",
    request: {
      method: "tools/call",
      params: {
        name: "form_submit",
        arguments: {
          url: "https://example.com/submit",
          data: { name: "test" },
        },
      },
    },
    expect: {
      success: false,
      errorCode: -32001,
      errorDataCode: "APPROVAL_REQUIRED",
      upstreamInvoked: false,
      createsApprovalRequest: true,
    },
  },

  // ============================================
  // 5. TRANSFER_VALUE - Should be denied
  // ============================================
  {
    id: "transfer-denied",
    name: "TRANSFER_VALUE denied by default",
    description: "TRANSFER_VALUE tool calls should be denied",
    request: {
      method: "tools/call",
      params: {
        name: "payment_send",
        arguments: { to: "alice@example.com", amount: 100 },
      },
    },
    expect: {
      success: false,
      errorCode: -32002,
      errorDataCode: "ACCESS_DENIED",
      upstreamInvoked: false,
    },
  },

  // ============================================
  // 6. SEND external - Should require approval
  // ============================================
  {
    id: "send-external-requires-approval",
    name: "SEND to external domain requires approval",
    description: "Sending email to external domain should require approval",
    request: {
      method: "tools/call",
      params: {
        name: "email_send",
        arguments: {
          to: "external@gmail.com",
          subject: "Test",
          body: "Hello",
        },
      },
    },
    expect: {
      success: false,
      errorCode: -32001,
      errorDataCode: "APPROVAL_REQUIRED",
      upstreamInvoked: false,
      createsApprovalRequest: true,
    },
  },

  // ============================================
  // 7. Non-tool methods pass through
  // ============================================
  {
    id: "tools-list-passthrough",
    name: "tools/list passes through",
    description: "Non-tool-call methods should pass through to upstream",
    request: {
      method: "tools/list",
      params: {},
    },
    expect: {
      success: true,
      upstreamInvoked: true, // tools/list goes to upstream
    },
  },

  // ============================================
  // 8. Initialize passes through
  // ============================================
  {
    id: "initialize-passthrough",
    name: "initialize passes through",
    description: "Initialize should pass through to upstream",
    request: {
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    },
    expect: {
      success: true,
      upstreamInvoked: true,
    },
  },
];

/**
 * Approval flow scenarios (require stateful cloud interaction)
 */
export const APPROVAL_FLOW_SCENARIOS: TestScenario[] = [
  // ============================================
  // 9. Approve and retry
  // ============================================
  {
    id: "approve-and-retry",
    name: "Approve once → retry succeeds",
    description: "After approval, retry with token should succeed",
    request: {
      method: "tools/call",
      params: {
        name: "shell_exec",
        arguments: { command: "echo hello" },
      },
    },
    setup: {
      approveFirst: true,
    },
    retryWith: {
      useApprovalToken: true,
    },
    expect: {
      success: true,
      upstreamInvoked: true,
      consumesToken: true,
    },
  },

  // ============================================
  // 10. Token reuse denied
  // ============================================
  {
    id: "token-reuse-denied",
    name: "Token reuse → denied",
    description: "Using the same token twice should fail",
    request: {
      method: "tools/call",
      params: {
        name: "shell_exec",
        arguments: { command: "echo hello" },
      },
    },
    retryWith: {
      reusedToken: true,
    },
    expect: {
      success: false,
      errorCode: -32002,
      upstreamInvoked: false,
    },
  },

  // ============================================
  // 11. Mutated args denied
  // ============================================
  {
    id: "mutated-args-denied",
    name: "Mutated args → denied",
    description: "Retry with different args than original should fail",
    request: {
      method: "tools/call",
      params: {
        name: "shell_exec",
        arguments: { command: "echo hello" },
      },
    },
    setup: {
      approveFirst: true,
    },
    retryWith: {
      useApprovalToken: true,
      mutateArgs: { command: "rm -rf /" }, // Changed!
    },
    expect: {
      success: false,
      errorCode: -32002,
      upstreamInvoked: false,
    },
  },

  // ============================================
  // 12. Expired token denied
  // ============================================
  {
    id: "expired-token-denied",
    name: "Expired token → denied",
    description: "Using an expired token should fail",
    request: {
      method: "tools/call",
      params: {
        name: "shell_exec",
        arguments: { command: "echo hello" },
      },
    },
    retryWith: {
      expiredToken: true,
    },
    expect: {
      success: false,
      errorCode: -32002,
      upstreamInvoked: false,
    },
  },

  // ============================================
  // 13. Lease allows without approval
  // ============================================
  {
    id: "lease-allows",
    name: "Active lease → allowed",
    description: "With an active lease, subsequent calls should be allowed",
    request: {
      method: "tools/call",
      params: {
        name: "shell_exec",
        arguments: { command: "echo hello" },
      },
    },
    setup: {
      createLease: {
        actionClass: "execute",
        durationMinutes: 60,
      },
    },
    expect: {
      success: true,
      upstreamInvoked: true,
    },
  },
];

/**
 * Error handling scenarios
 */
export const ERROR_SCENARIOS: TestScenario[] = [
  // ============================================
  // 14. Cloud unreachable (fail-closed for risky)
  // ============================================
  {
    id: "cloud-down-risky-denied",
    name: "Cloud down + risky action → denied",
    description: "When cloud is unreachable, risky actions should fail-closed",
    request: {
      method: "tools/call",
      params: {
        name: "shell_exec",
        arguments: { command: "ls" },
      },
    },
    // This scenario requires special setup (cloud URL pointing to nothing)
    expect: {
      success: false,
      upstreamInvoked: false,
    },
  },

  // ============================================
  // 15. Cloud unreachable (fail-open for reads)
  // ============================================
  {
    id: "cloud-down-read-allowed",
    name: "Cloud down + READ action → allowed",
    description: "When cloud is unreachable, READ actions should still work",
    request: {
      method: "tools/call",
      params: {
        name: "notes_read",
        arguments: { noteId: "note-123" },
      },
    },
    // This scenario requires special setup
    expect: {
      success: true,
      upstreamInvoked: true,
    },
  },
];

/**
 * All scenarios combined
 */
export const ALL_SCENARIOS: TestScenario[] = [
  ...BASE_SCENARIOS,
  ...APPROVAL_FLOW_SCENARIOS,
  ...ERROR_SCENARIOS,
];
