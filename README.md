# Latch

Control layer for autonomous AI agents. Safe actions run automatically. Risky actions wait for approval.

## What is Latch?

Latch is an open-source guard proxy for MCP (Model Context Protocol) servers. It sits between your AI agent and its tools, enforcing policies on what the agent can do:

- **Safe actions** (reads, internal writes) → Pass through automatically
- **Risky actions** (shell commands, external sends) → Require human approval
- **Forbidden actions** (payments, destructive ops) → Blocked entirely

## Quick Start

### With Docker

```bash
git clone https://github.com/latchhq/latch
cd latch
docker compose up --build
```

Dashboard: http://localhost:3000

### Install CLI

```bash
npm install -g @latch/cli
latch init
```

### Wrap an MCP Server

```bash
latch run --upstream-command "npx" --upstream-args "-y,@modelcontextprotocol/server-github"
```

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│  Latch CLI  │────▶│ MCP Server  │
│             │     │   (proxy)   │     │             │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  Dashboard  │
                    │  (policies, │
                    │  approvals) │
                    └─────────────┘
```

1. Agent makes a tool call
2. Latch CLI intercepts and classifies the action
3. Policy is evaluated (allow / deny / require approval)
4. If approved, call is forwarded to the real MCP server
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

- **Deterministic policies** - Rules-based, no AI making security decisions
- **Natural language rules** - Create policies in plain English
- **Approval workflow** - Single-use tokens, time-limited leases
- **Audit logging** - Full history of all tool calls
- **Telegram notifications** - Approve from your phone
- **Self-hosted** - Your data stays on your infrastructure

## Documentation

See the [docs](./docs) folder for detailed documentation.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT - see [LICENSE](./LICENSE)
