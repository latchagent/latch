"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";

type ImportedServer =
  | {
      key: string;
      kind: "http";
      url: string;
      headers: Record<string, string>;
    }
  | {
      key: string;
      kind: "stdio";
      command: string;
      args: string[];
    };

function parseImportedServers(raw: string): ImportedServer[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") return [];
  const root = parsed as Record<string, unknown>;
  const mcpServers = root.mcpServers as unknown;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) return [];

  const out: ImportedServer[] = [];
  for (const [key, value] of Object.entries(mcpServers as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;

    if (typeof v.url === "string") {
      const headersRaw = v.headers as unknown;
      const headers: Record<string, string> = {};
      if (headersRaw && typeof headersRaw === "object" && !Array.isArray(headersRaw)) {
        for (const [hk, hv] of Object.entries(headersRaw as Record<string, unknown>)) {
          if (typeof hv === "string") headers[hk] = hv;
        }
      }
      out.push({ key, kind: "http", url: v.url, headers });
      continue;
    }

    if (typeof v.command === "string") {
      const args = Array.isArray(v.args) ? v.args.filter((a) => typeof a === "string") : [];
      out.push({ key, kind: "stdio", command: v.command, args: args as string[] });
      continue;
    }
  }

  return out;
}

export function ImportMcpConfigDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [rawJson, setRawJson] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [upstreamName, setUpstreamName] = useState("");

  const servers = useMemo(() => {
    try {
      return parseImportedServers(rawJson);
    } catch {
      return [];
    }
  }, [rawJson]);

  const selected = servers.find((s) => s.key === selectedKey);

  const onSelect = (key: string) => {
    setSelectedKey(key);
    setUpstreamName(key);
  };

  const handleCreate = async () => {
    if (!selected) {
      toast({
        title: "Select a server",
        description: "Pick one entry from the pasted config.",
        variant: "destructive",
      });
      return;
    }

    if (!upstreamName.trim()) {
      toast({
        title: "Missing name",
        description: "Upstream name is required.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const body =
        selected.kind === "http"
          ? {
              workspaceId,
              name: upstreamName.trim(),
              transport: "http",
              baseUrl: selected.url,
              headers: Object.keys(selected.headers).length > 0 ? selected.headers : undefined,
              authType: "none",
            }
          : {
              workspaceId,
              name: upstreamName.trim(),
              transport: "stdio",
              stdioCommand: selected.command,
              stdioArgs: selected.args,
            };

      const res = await fetch("/api/upstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create upstream");

      toast({ title: "Imported", description: "Upstream created from MCP config." });
      setOpen(false);
      router.refresh();

      setRawJson("");
      setSelectedKey("");
      setUpstreamName("");
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Failed to import config",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import MCP config
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Import MCP server config</DialogTitle>
          <DialogDescription>
            Paste a config containing an <span className="font-mono">mcpServers</span> object (Cursor,
            Claude Desktop, etc). We&apos;ll create a Latch upstream from one entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="rawJson">Config JSON</Label>
            <Textarea
              id="rawJson"
              placeholder={`{"mcpServers":{"notion":{"url":"https://...","headers":{"Authorization":"Bearer ..."}}}}`}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              className="font-mono text-xs min-h-[180px]"
            />
            <p className="text-xs text-muted-foreground">
              Notes: header values are treated as secrets and won&apos;t be shown again after save.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Server entry</Label>
              <Select value={selectedKey} onValueChange={onSelect}>
                <SelectTrigger>
                  <SelectValue placeholder={servers.length ? "Select a server" : "Paste JSON first"} />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.key} ({s.kind})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="upstreamName">Upstream name</Label>
              <Input
                id="upstreamName"
                value={upstreamName}
                onChange={(e) => setUpstreamName(e.target.value)}
                placeholder="e.g., notion, cursor-chat-history"
              />
            </div>
          </div>

          {selected ? (
            <div className="rounded-lg border p-3 text-xs">
              <div className="font-medium">Preview</div>
              <div className="mt-2 font-mono text-muted-foreground whitespace-pre-wrap">
                {selected.kind === "http"
                  ? `transport: http\nbaseUrl: ${selected.url}\nheaders: ${Object.keys(selected.headers).length}`
                  : `transport: stdio\ncommand: ${selected.command}\nargs: ${selected.args.length}`}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? "Importing..." : "Create upstream"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

