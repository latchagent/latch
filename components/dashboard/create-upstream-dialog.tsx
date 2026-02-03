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
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CreateUpstreamDialogProps {
  workspaceId: string;
}

export function CreateUpstreamDialog({ workspaceId }: CreateUpstreamDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [authValue, setAuthValue] = useState("");

  const handleSubmit = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/upstreams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          baseUrl,
          authType,
          authValue: authValue || undefined,
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
      setName("");
      setBaseUrl("");
      setAuthType("none");
      setAuthValue("");
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
            <Label>Authentication</Label>
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
