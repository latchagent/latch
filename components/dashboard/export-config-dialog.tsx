"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileJson } from "lucide-react";

type UpstreamForExport = {
  id: string;
  name: string;
  transport: "http" | "stdio";
  baseUrl: string | null;
  headerNames: string[];
  stdioCommand: string | null;
  stdioArgs: string[] | null;
};

function asCommaArgs(args: string[]): string {
  // CLI expects a comma-separated string.
  return args.join(",");
}

export function ExportConfigDialog({
  cloudUrl,
  workspaceId,
  upstream,
}: {
  cloudUrl: string;
  workspaceId: string;
  upstream: UpstreamForExport;
}) {
  const [open, setOpen] = useState(false);
  const [agentKey, setAgentKey] = useState("YOUR_AGENT_KEY");

  const claudeRemoteHttpSnippet = useMemo(() => {
    if (upstream.transport !== "http" || !upstream.baseUrl) return null;

    const env: Record<string, string> = {};
    const headerArgs: string[] = [];

    for (const headerName of upstream.headerNames || []) {
      const envKey = `MCP_HEADER_${headerName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")}`;
      env[envKey] = "YOUR_VALUE";
      headerArgs.push("--header", `${headerName}:\${${envKey}}`);
    }

    // mcp-remote bridges remote HTTP/SSE MCP to stdio, so Claude Desktop can run it.
    // We then run that through Latch CLI (stdio) so approvals/policies apply.
    const upstreamArgs = asCommaArgs([
      "-y",
      "mcp-remote",
      upstream.baseUrl,
      ...headerArgs,
    ]);

    return JSON.stringify(
      {
        mcpServers: {
          [`${upstream.name}-via-latch`]: {
            command: "npx",
            args: [
              "-y",
              "@latchagent/cli",
              "run",
              "--upstream-command",
              "npx",
              "--upstream-args",
              upstreamArgs,
              "--cloud-url",
              cloudUrl,
              "--workspace",
              workspaceId,
              "--upstream-id",
              upstream.id,
              "--agent-key",
              agentKey,
              "--wait-for-approval",
              "--approval-timeout",
              "600",
            ],
            ...(Object.keys(env).length > 0 ? { env } : {}),
          },
        },
      },
      null,
      2
    );
  }, [agentKey, cloudUrl, upstream, workspaceId]);

  const stdioSnippet = useMemo(() => {
    if (upstream.transport !== "stdio" || !upstream.stdioCommand) return null;
    const upstreamArgs = asCommaArgs(upstream.stdioArgs ?? []);

    return JSON.stringify(
      {
        mcpServers: {
          [`${upstream.name}-via-latch`]: {
            command: "npx",
            args: [
              "-y",
              "@latchagent/cli",
              "run",
              "--upstream-command",
              upstream.stdioCommand,
              "--upstream-args",
              upstreamArgs,
              "--cloud-url",
              cloudUrl,
              "--workspace",
              workspaceId,
              "--upstream-id",
              upstream.id,
              "--agent-key",
              agentKey,
              "--wait-for-approval",
              "--approval-timeout",
              "600",
            ],
          },
        },
      },
      null,
      2
    );
  }, [agentKey, cloudUrl, upstream, workspaceId]);

  const stdioSyncCommand = useMemo(() => {
    if (upstream.transport !== "stdio" || !upstream.stdioCommand) return null;
    const upstreamArgs = asCommaArgs(upstream.stdioArgs ?? []);
    return `npx -y @latchagent/cli sync-tools --upstream-command "${upstream.stdioCommand}" --upstream-args "${upstreamArgs}" --cloud-url "${cloudUrl}" --workspace "${workspaceId}" --upstream-id "${upstream.id}" --agent-key "${agentKey}"`;
  }, [agentKey, cloudUrl, upstream, workspaceId]);

  const httpSnippet = useMemo(() => {
    if (upstream.transport !== "http") return null;
    // This points the client at the Latch dashboard proxy endpoint.
    // NOTE: some clients expect MCP-over-HTTP streaming; this is best-effort for clients that
    // can do JSON-RPC over HTTP POST.
    return JSON.stringify(
      {
        mcpServers: {
          [`${upstream.name}-via-latch`]: {
            url: `${cloudUrl.replace(/\/$/, "")}/api/proxy?upstream=${encodeURIComponent(
              upstream.name
            )}`,
            headers: {
              "X-Latch-Key": agentKey,
              "X-Latch-Upstream": upstream.name,
            },
          },
        },
      },
      null,
      2
    );
  }, [agentKey, cloudUrl, upstream]);

  const defaultTab = upstream.transport === "http" ? "http" : "stdio";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileJson className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[780px]">
        <DialogHeader>
          <DialogTitle>Export client config</DialogTitle>
          <DialogDescription>
            Generates a pasteable <span className="font-mono">mcpServers</span> entry that routes via
            Latch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="agentKey">Agent key</Label>
            <Input
              id="agentKey"
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value)}
              className="font-mono"
              type="password"
            />
            <p className="text-xs text-muted-foreground">
              This is the agent/client key you created in the dashboard. It is only used to render
              the snippet locally in your browser.
            </p>
          </div>

          <Tabs defaultValue={defaultTab}>
            <TabsList>
              <TabsTrigger value="http" disabled={!httpSnippet}>
                URL (MCP clients that support it)
              </TabsTrigger>
              <TabsTrigger value="claude" disabled={!claudeRemoteHttpSnippet}>
                Claude Desktop (remote HTTP)
              </TabsTrigger>
              <TabsTrigger value="stdio" disabled={!stdioSnippet}>
                Stdio (Latch CLI)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="http">
              {httpSnippet ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Note: some clients (including Claude Desktop) require{" "}
                    <span className="font-mono">command</span> +{" "}
                    <span className="font-mono">args</span> servers and will reject URL entries.
                  </p>
                  <SnippetBlock value={httpSnippet} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This upstream is not HTTP-based.
                </p>
              )}
            </TabsContent>

            <TabsContent value="claude">
              {claudeRemoteHttpSnippet ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    This wraps the remote URL using{" "}
                    <span className="font-mono">mcp-remote</span> so Claude Desktop can run it as a
                    local stdio server.
                  </p>
                  <SnippetBlock value={claudeRemoteHttpSnippet} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This upstream is not HTTP-based.
                </p>
              )}
            </TabsContent>

            <TabsContent value="stdio">
              {stdioSnippet ? (
                <div className="space-y-3">
                  <SnippetBlock value={stdioSnippet} />
                  {stdioSyncCommand ? (
                    <div className="rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-between px-3 py-2 border-b">
                        <div className="text-xs text-muted-foreground">
                          One-time tool sync (stdio)
                        </div>
                        <CopyButton value={stdioSyncCommand} />
                      </div>
                      <pre className="overflow-x-auto p-3 text-xs">
                        <code>{stdioSyncCommand}</code>
                      </pre>
                      <div className="px-3 pb-3 text-xs text-muted-foreground">
                        Stdio tools only appear after the upstream runs once. Run this command, then
                        create per-tool rules in the dashboard.
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This upstream is not stdio-based.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SnippetBlock({ value }: { value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-xs text-muted-foreground">JSON</div>
        <CopyButton value={value} />
      </div>
      <pre className="overflow-x-auto p-3 text-xs">
        <code>{value}</code>
      </pre>
    </div>
  );
}

