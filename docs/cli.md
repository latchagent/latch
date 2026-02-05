# CLI

## Install

```bash
npm install -g @latchagent/cli
```

## Configure

```bash
latch init
```

This writes `~/.latch/config.json` so you don’t have to pass `--cloud-url`, `--workspace`, etc. every time.

## Run (wrap an upstream MCP server)

```bash
latch run --upstream-command "npx" --upstream-args "-y,@modelcontextprotocol/server-filesystem,/tmp"
```

## Common flags

- `--cloud-url`: Latch dashboard/API URL (default should come from config)
- `--workspace`: Workspace ID
- `--upstream-id`: Upstream ID
- `--agent-key`: Agent key

