# Latch Testing Guide

This guide explains how to test the Latch MCP proxy comprehensively.

## Architecture Overview

```
┌─────────────────┐     stdin/stdout     ┌─────────────────┐     stdin/stdout     ┌─────────────────┐
│   Test Harness  │ ──────────────────► │   Latch CLI     │ ──────────────────► │  Toy MCP Server │
│  (MCP Client)   │ ◄────────────────── │    (Bridge)     │ ◄────────────────── │   (Upstream)    │
└─────────────────┘                      └─────────────────┘                      └─────────────────┘
                                                │
                                                │ HTTPS
                                                ▼
                                         ┌─────────────────┐
                                         │  Latch Cloud    │
                                         │  (Next.js API)  │
                                         └─────────────────┘
```

## Prerequisites

- Node.js 18+
- PostgreSQL database running
- All packages built (`npm run build` in each package)

## Quick Start

### 1. Build Everything

```bash
# From repo root
cd packages/shared && npm run build
cd ../cli && npm run build
cd ../demo-mcp-server && npm run build
cd ../test-harness && npm run build
```

### 2. Start the Cloud

```bash
# Make sure .env is configured with DATABASE_URL and BETTER_AUTH_SECRET
npm run dev
```

### 3. Create Test Data

**Option A: Use the test setup endpoint**

```bash
curl -X POST http://localhost:3000/api/test/setup \
  -H "Content-Type: application/json" \
  -d '{"workspaceName": "Test Workspace"}'
```

This returns:
```json
{
  "workspace": { "id": "...", "name": "Test Workspace" },
  "upstream": { "id": "...", "name": "Test Upstream" },
  "agent": { "id": "...", "name": "Test Agent", "clientKey": "..." },
  "envVars": {
    "LATCH_WORKSPACE": "...",
    "LATCH_UPSTREAM_ID": "...",
    "LATCH_AGENT_KEY": "..."
  }
}
```

**Option B: Use the dashboard manually**

1. Register at http://localhost:3000/register
2. Create an upstream (name doesn't matter for stdio)
3. Create an agent, save the client key

### 4. Run the Test Harness

```bash
# Set environment variables from step 3
export LATCH_WORKSPACE="<workspace-id>"
export LATCH_UPSTREAM_ID="<upstream-id>"
export LATCH_AGENT_KEY="<agent-key>"
export LATCH_CLOUD_URL="http://localhost:3000"

# Run scenarios
cd packages/test-harness
npm test
```

## Test Scenarios

The test harness includes 15+ scenarios covering all major flows:

### Base Scenarios (No Cloud State)

| ID | Name | Expected |
|----|------|----------|
| `read-allowed` | READ action allowed | ✅ Success, upstream invoked |
| `write-allowed` | WRITE action allowed | ✅ Success, upstream invoked |
| `execute-requires-approval` | EXECUTE requires approval | ❌ Error -32001, no upstream |
| `submit-requires-approval` | SUBMIT requires approval | ❌ Error -32001, no upstream |
| `transfer-denied` | TRANSFER_VALUE denied | ❌ Error -32002, no upstream |
| `send-external-requires-approval` | SEND to external | ❌ Error -32001, no upstream |
| `tools-list-passthrough` | tools/list passes through | ✅ Success, upstream invoked |
| `initialize-passthrough` | initialize passes through | ✅ Success, upstream invoked |

### Approval Flow Scenarios (Require Cloud)

| ID | Name | Expected |
|----|------|----------|
| `approve-and-retry` | Approve once → retry | ✅ Success after token |
| `token-reuse-denied` | Token reuse → denied | ❌ Error -32002 |
| `mutated-args-denied` | Mutated args → denied | ❌ Error -32002 |
| `expired-token-denied` | Expired token → denied | ❌ Error -32002 |
| `lease-allows` | Active lease → allowed | ✅ Success |

### Error Handling Scenarios

| ID | Name | Expected |
|----|------|----------|
| `cloud-down-risky-denied` | Cloud down + risky | ❌ Fail-closed |
| `cloud-down-read-allowed` | Cloud down + READ | ✅ Fail-open |

## Toy MCP Server

The toy server provides deterministic tools for each action class:

| Tool | Action Class | Example Args |
|------|--------------|--------------|
| `notes_read` | READ | `{ "noteId": "123" }` |
| `file_write` | WRITE | `{ "path": "/tmp/test", "content": "hello" }` |
| `email_send` | SEND | `{ "to": "user@gmail.com", "subject": "Hi", "body": "Hello" }` |
| `shell_exec` | EXECUTE | `{ "command": "ls -la" }` |
| `form_submit` | SUBMIT | `{ "url": "https://example.com", "data": {} }` |
| `payment_send` | TRANSFER_VALUE | `{ "to": "alice", "amount": 100 }` |

Test helpers:
- `_test_getInvocations` - Get invocation count (for assertions)
- `_test_reset` - Reset invocation log

Invocations are logged to `/tmp/toy-mcp-invocations.json`.

## Manual Testing with MCP Inspector

The official MCP Inspector provides a visual interface:

```bash
npx @modelcontextprotocol/inspector node packages/cli/dist/index.js run \
  --upstream-command "npx" \
  --upstream-args "tsx,packages/demo-mcp-server/src/index.ts" \
  --cloud-url "http://localhost:3000" \
  --workspace "<workspace-id>" \
  --upstream-id "<upstream-id>" \
  --agent-key "<agent-key>"
```

This opens a browser UI where you can:
1. List available tools
2. Call tools interactively
3. See responses and errors
4. Test the approval flow

## Testing with Real MCP Servers

### GitHub MCP

```bash
# Install GitHub MCP
npm install -g @modelcontextprotocol/server-github

# Run with Latch
node packages/cli/dist/index.js run \
  --upstream-command "npx" \
  --upstream-args "-y,@modelcontextprotocol/server-github" \
  --cloud-url "http://localhost:3000" \
  --workspace "<workspace-id>" \
  --upstream-id "<upstream-id>" \
  --agent-key "<agent-key>"
```

Set `GITHUB_PERSONAL_ACCESS_TOKEN` in your environment.

### Filesystem MCP

```bash
node packages/cli/dist/index.js run \
  --upstream-command "npx" \
  --upstream-args "-y,@modelcontextprotocol/server-filesystem,/tmp/test-sandbox" \
  --cloud-url "http://localhost:3000" \
  --workspace "<workspace-id>" \
  --upstream-id "<upstream-id>" \
  --agent-key "<agent-key>"
```

## Approval Flow Testing

### Step-by-Step Manual Test

1. **Trigger approval:**
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"shell_exec","arguments":{"command":"ls"}}}' | \
     node packages/cli/dist/index.js run ...
   ```

2. **Check response:**
   ```json
   {
     "error": {
       "code": -32001,
       "data": {
         "code": "APPROVAL_REQUIRED",
         "approval_request_id": "abc123"
       }
     }
   }
   ```

3. **Approve via dashboard or API:**
   ```bash
   curl -X POST http://localhost:3000/api/test/approve \
     -H "Content-Type: application/json" \
     -d '{"approvalRequestId": "abc123"}'
   ```

4. **Retry with token:**
   ```bash
   echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"shell_exec","arguments":{"command":"ls"},"approvalToken":"<token>"}}' | \
     node packages/cli/dist/index.js run ...
   ```

5. **Should succeed!**

## Fail-Closed Behavior

When the cloud is unreachable:

| Action Class | Behavior | Reason |
|--------------|----------|--------|
| READ | ✅ Allowed | Fail-open for UX |
| WRITE | ✅ Allowed | Fail-open for UX |
| SEND (internal) | ✅ Allowed | Low risk |
| SEND (external) | ❌ Blocked | Fail-closed |
| EXECUTE | ❌ Blocked | Fail-closed |
| SUBMIT | ❌ Blocked | Fail-closed |
| TRANSFER_VALUE | ❌ Blocked | Fail-closed |

Test this by pointing to a non-existent cloud URL:

```bash
node packages/cli/dist/index.js run \
  --upstream-command "npx" \
  --upstream-args "tsx,packages/demo-mcp-server/src/index.ts" \
  --cloud-url "http://localhost:9999" \  # Non-existent
  --workspace "fake" \
  --upstream-id "fake" \
  --agent-key "fake"
```

## Verifying in the Dashboard

After running tests, check:

1. **Audit Log** (`/audit`) - All requests with decisions
2. **Approvals** (`/approvals`) - Pending approval requests
3. **Overview** (`/overview`) - Aggregate stats

## CI Integration

```bash
# Run all tests
npm test

# Unit tests only (fast)
npm run test:unit

# Integration tests (spawn processes)
npm run test:integration

# E2E smoke test
npm run test:e2e
```

## Troubleshooting

### "Invalid agent key"
- Verify the agent key matches and the agent belongs to the workspace
- Keys are hashed; make sure you're using the raw key, not the hash

### "Authorization service unavailable"
- Check the cloud URL is correct
- Verify the server is running (`npm run dev`)

### "Token binding mismatch"
- The retry must have the **exact same arguments** as the original request
- Args are hashed; any change will fail validation

### Process hangs
- Check for uncaught errors in stderr
- Verify the upstream MCP server is responding
- Add `VERBOSE=true` to see full stdio output

### Invocations not logged
- Check `/tmp/toy-mcp-invocations.json` exists and is writable
- Verify the toy server started (check stderr output)
