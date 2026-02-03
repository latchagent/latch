# @latch/cli

Latch CLI is an MCP guard proxy that sits between your agent and an upstream MCP server, enforcing deterministic policies and requiring approval for risky actions.

## Install

```bash
npm install -g @latch/cli
```

## Setup

```bash
latch init
```

This stores defaults in `~/.latch/config.json`.

## Run (wrap an MCP server)

```bash
latch run --upstream-command "npx" --upstream-args "-y,@modelcontextprotocol/server-github"
```

## Repository

Source lives in the main repo at `packages/cli`.

