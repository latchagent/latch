"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type UpstreamRow = {
  id: string;
  name: string;
  transport: "http" | "stdio";
  baseUrl: string | null;
  headers: Record<string, string> | null;
  authType: "none" | "bearer" | "header";
  authValue: string | null;
  stdioCommand: string | null;
  stdioArgs: string[] | null;
};

export function UpstreamActions({ upstream }: { upstream: UpstreamRow }) {
  const router = useRouter();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/upstreams/${upstream.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete upstream");
      toast({ title: "Upstream deleted" });
      setShowDeleteDialog(false);
      router.refresh();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete upstream",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUpstreamDialog
        upstream={upstream}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete upstream</DialogTitle>
            <DialogDescription>
              This will delete the upstream and any associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditUpstreamDialog({
  upstream,
  open,
  onOpenChange,
}: {
  upstream: UpstreamRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState(upstream.name);
  const [transport, setTransport] = useState<"http" | "stdio">(upstream.transport);

  const [baseUrl, setBaseUrl] = useState(upstream.baseUrl || "");
  const [authType, setAuthType] = useState(upstream.authType);
  const [authValue, setAuthValue] = useState(upstream.authValue || "");
  const [replaceHeadersJson, setReplaceHeadersJson] = useState("");
  const [clearHeaders, setClearHeaders] = useState(false);

  const [stdioCommand, setStdioCommand] = useState(upstream.stdioCommand || "");
  const [stdioArgsRaw, setStdioArgsRaw] = useState(
    (upstream.stdioArgs || []).join("\n")
  );

  const handleSave = async () => {
    setIsLoading(true);
    try {
      let headers: Record<string, string> | null | undefined = undefined;
      if (clearHeaders) headers = null;
      if (replaceHeadersJson.trim()) {
        const parsed = JSON.parse(replaceHeadersJson) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Headers must be a JSON object");
        }
        headers = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v !== "string") throw new Error(`Header value for "${k}" must be a string`);
          (headers as Record<string, string>)[k] = v;
        }
      }

      const stdioArgs = stdioArgsRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload =
        transport === "http"
          ? {
              name,
              transport,
              baseUrl,
              authType,
              authValue: authType === "none" ? null : authValue || null,
              headers,
            }
          : {
              name,
              transport,
              stdioCommand,
              stdioArgs,
              // keep stdioEnv/cwd for later
            };

      const res = await fetch(`/api/upstreams/${upstream.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update upstream");

      toast({ title: "Upstream updated" });
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update upstream",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Edit upstream</DialogTitle>
          <DialogDescription>Update transport and connection settings.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Transport</Label>
            <Select value={transport} onValueChange={(v) => setTransport(v as "http" | "stdio")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="stdio">STDIO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {transport === "http" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Endpoint / Base URL</Label>
                <Input
                  id="baseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  You can paste a full MCP endpoint like <span className="font-mono">https://host/foo/mcp</span>.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Authentication (optional)</Label>
                <Select
                  value={authType}
                  onValueChange={(v) => setAuthType(v as "none" | "bearer" | "header")}
                >
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

              {authType !== "none" ? (
                <div className="space-y-2">
                  <Label htmlFor="authValue">{authType === "bearer" ? "Token" : "Header (Name: Value)"}</Label>
                  <Input
                    id="authValue"
                    type="password"
                    value={authValue}
                    onChange={(e) => setAuthValue(e.target.value)}
                    className="font-mono"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="replaceHeadersJson">Replace headers JSON (optional)</Label>
                <Textarea
                  id="replaceHeadersJson"
                  placeholder={`{"Authorization":"Bearer ...","x-api-key":"..."}`}
                  value={replaceHeadersJson}
                  onChange={(e) => setReplaceHeadersJson(e.target.value)}
                  className="font-mono text-xs"
                />
                <div className="text-xs text-muted-foreground">
                  Currently stored headers: {upstream.headers ? Object.keys(upstream.headers).length : 0}. Values are not shown.
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="clearHeaders"
                    type="checkbox"
                    checked={clearHeaders}
                    onChange={(e) => setClearHeaders(e.target.checked)}
                  />
                  <Label htmlFor="clearHeaders" className="text-xs">
                    Clear headers
                  </Label>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="stdioCommand">Command</Label>
                <Input
                  id="stdioCommand"
                  value={stdioCommand}
                  onChange={(e) => setStdioCommand(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stdioArgs">Args (one per line)</Label>
                <Textarea
                  id="stdioArgs"
                  value={stdioArgsRaw}
                  onChange={(e) => setStdioArgsRaw(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

