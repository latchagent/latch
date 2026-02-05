"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CreateUpstreamDialogProps {
  workspaceId: string;
}

export function CreateUpstreamDialog({ workspaceId }: CreateUpstreamDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [transport, setTransport] = useState<"http" | "stdio">("http");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [authValue, setAuthValue] = useState("");
  const [headersJson, setHeadersJson] = useState("");

  const [stdioCommand, setStdioCommand] = useState("");
  const [stdioArgsRaw, setStdioArgsRaw] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (transport === "http" && !baseUrl.trim()) {
      toast({
        title: "Error",
        description: "Base URL is required for HTTP upstreams",
        variant: "destructive",
      });
      return;
    }

    if (transport === "stdio" && !stdioCommand.trim()) {
      toast({
        title: "Error",
        description: "Command is required for stdio upstreams",
        variant: "destructive",
      });
      return;
    }

    let headers: Record<string, string> | undefined;
    if (headersJson.trim()) {
      try {
        const parsed = JSON.parse(headersJson) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Headers must be a JSON object");
        }
        headers = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v !== "string") {
            throw new Error(`Header value for "${k}" must be a string`);
          }
          headers[k] = v;
        }
      } catch (e) {
        toast({
          title: "Invalid headers JSON",
          description: e instanceof Error ? e.message : "Failed to parse headers",
          variant: "destructive",
        });
        return;
      }
    }

    const stdioArgs = stdioArgsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    setIsLoading(true);
    try {
      const response = await fetch("/api/upstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          transport,

          baseUrl: transport === "http" ? baseUrl : undefined,
          authType: transport === "http" ? authType : "none",
          authValue: transport === "http" ? authValue || undefined : undefined,
          headers: transport === "http" ? headers : undefined,

          stdioCommand: transport === "stdio" ? stdioCommand : undefined,
          stdioArgs: transport === "stdio" ? stdioArgs : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create upstream");
      }

      toast({
        title: "Upstream created",
        description: "The upstream server has been configured.",
      });
      setOpen(false);
      router.refresh();

      // Reset form
      setTransport("http");
      setName("");
      setBaseUrl("");
      setAuthType("none");
      setAuthValue("");
      setHeadersJson("");
      setStdioCommand("");
      setStdioArgsRaw("");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create upstream",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Upstream
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Upstream Server</DialogTitle>
          <DialogDescription>
            Configure an upstream MCP server to route requests to.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., github-mcp, filesystem"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Transport</Label>
            <Select
              value={transport}
              onValueChange={(v) => setTransport(v as "http" | "stdio")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP (remote URL)</SelectItem>
                <SelectItem value="stdio">Stdio (command/args)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {transport === "http" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl"
                  placeholder="https://mcp-server.example.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Authentication (optional)</Label>
                <Select value={authType} onValueChange={setAuthType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="header">Custom Header</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authType !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="authValue">
                    {authType === "bearer" ? "Token" : "Header (Name: Value)"}
                  </Label>
                  <Input
                    id="authValue"
                    type="password"
                    placeholder={
                      authType === "bearer"
                        ? "your-token-here"
                        : "X-API-Key: your-key"
                    }
                    value={authValue}
                    onChange={(e) => setAuthValue(e.target.value)}
                    className="font-mono"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="headersJson">Headers JSON (optional)</Label>
                <Textarea
                  id="headersJson"
                  placeholder={`{"Authorization":"Bearer ...","x-api-key":"..."}`}
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="stdioCommand">Command</Label>
                <Input
                  id="stdioCommand"
                  placeholder="npx"
                  value={stdioCommand}
                  onChange={(e) => setStdioCommand(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stdioArgs">Args (one per line)</Label>
                <Textarea
                  id="stdioArgs"
                  placeholder={`-y\n--package=cursor-chat-history-mcp\ncursor-chat-history-mcp`}
                  value={stdioArgsRaw}
                  onChange={(e) => setStdioArgsRaw(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Creating..." : "Add Upstream"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
