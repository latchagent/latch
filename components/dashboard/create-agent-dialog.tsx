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
import { Plus, Copy, CheckCheck, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CreateAgentDialogProps {
  workspaceId: string;
}

export function CreateAgentDialog({ workspaceId }: CreateAgentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [clientKey, setClientKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter an agent name",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create agent");
      }

      setClientKey(data.clientKey);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create agent",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyKey = () => {
    if (clientKey) {
      navigator.clipboard.writeText(clientKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setName("");
    setClientKey(null);
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(o) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {clientKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Agent Created</DialogTitle>
              <DialogDescription>
                Save this client key now. It won&apos;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 p-4">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">Save this key securely</span>
                </div>
                <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80">
                  This is the only time the client key will be displayed.
                </p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <Label className="text-xs text-muted-foreground">Client Key</Label>
                <code className="mt-2 block break-all text-sm">{clientKey}</code>
              </div>
              <Button onClick={copyKey} variant="outline" className="w-full">
                {copied ? (
                  <>
                    <CheckCheck className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Client Key
                  </>
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create Agent</DialogTitle>
              <DialogDescription>
                Create a new agent to connect to your MCP proxy.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Claude Desktop, OpenClaw"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Agent"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
