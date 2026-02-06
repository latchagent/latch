# Latch

Security guardrails for AI agents. Safe actions run automatically. Risky actions wait for approval.

## What is Latch?

Latch is an open-source proxy for MCP (Model Context Protocol) servers. It sits between your AI agent and its tools, enforcing policies on what the agent can do:

- **Safe actions** (reads, internal writes) → Pass through automatically
- **Risky actions** (shell commands, external sends) → Require human approval
- **Forbidden actions** (payments, destructive ops) → Blocked entirely

## Quick Start

```bash
# Start Latch with Docker
git clone https://github.com/latchagent/latch
cd latch
docker compose up -d
```

Open the dashboard at **http://localhost:3000**, create an account, and get your API key.

```bash
# Wrap an MCP server through Latch
npx @latchagent/cli@latest run \
  --api-key "latch_YOUR_KEY" \
  --upstream "my-server" \
  --upstream-command "npx" \
  --upstream-args "-y,@modelcontextprotocol/server-filesystem,/tmp"
```

## How It Works

**AI Agent** → **Latch CLI** → **Latch Server** → **MCP Server**

1. Agent makes a tool call
2. Latch CLI intercepts and classifies the action
3. Policy is evaluated (allow / deny / require approval)
4. If allowed, call is forwarded to the MCP server
5. Everything is logged for audit

## Action Classes

| Class | Default | Examples |
|-------|---------|----------|
| READ | Allow | File reads, API queries |
| WRITE | Allow | File writes, updates |
| SEND | Approval for external | Emails, messages |
| EXECUTE | Require approval | Shell commands |
| SUBMIT | Require approval | PRs, form submissions |
| TRANSFER_VALUE | Deny | Payments, transfers |

## Features

- **Policy engine** — Rules based on action class, upstream, and tool
- **LLM-evaluated policies** — Write conditions in plain English
- **Approval workflow** — Single-use tokens, argument-bound
- **Audit log** — Full history of all tool calls with redacted secrets
- **Telegram notifications** — Approve from your phone
- **Self-hosted** — Your data stays on your infrastructure

## Documentation

Full documentation at **[latch.mintlify.app](https://latch.mintlify.app/docs/introduction)**

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT — see [LICENSE](./LICENSE)
