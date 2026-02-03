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

interface Upstream {
  id: string;
  name: string;
}

interface CreateRuleDialogProps {
  workspaceId: string;
  upstreams?: Upstream[];
}

export function CreateRuleDialog({ workspaceId }: CreateRuleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState("");
  const [effect, setEffect] = useState<string>("allow");
  const [actionClass, setActionClass] = useState<string>("any");
  const [toolName, setToolName] = useState("");
  const [domainMatch, setDomainMatch] = useState("");
  const [domainMatchType, setDomainMatchType] = useState<string>("exact");
  const [priority, setPriority] = useState("50");

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: name || undefined,
          effect,
          actionClass,
          toolName: toolName || undefined,
          domainMatch: domainMatch || undefined,
          domainMatchType: domainMatch ? domainMatchType : undefined,
          priority: parseInt(priority, 10),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create rule");
      }

      toast({
        title: "Rule created",
        description: "The policy rule has been created successfully.",
      });
      setOpen(false);
      router.refresh();

      // Reset form
      setName("");
      setEffect("allow");
      setActionClass("any");
      setToolName("");
      setDomainMatch("");
      setPriority("50");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create rule",
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
          Create Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Policy Rule</DialogTitle>
          <DialogDescription>
            Define a rule for allowing, denying, or requiring approval for specific actions.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              placeholder="e.g., Allow GitHub API"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Effect</Label>
              <Select value={effect} onValueChange={setEffect}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                  <SelectItem value="require_approval">Require Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Action Class</Label>
              <Select value={actionClass} onValueChange={setActionClass}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="write">Write</SelectItem>
                  <SelectItem value="send">Send</SelectItem>
                  <SelectItem value="execute">Execute</SelectItem>
                  <SelectItem value="submit">Submit</SelectItem>
                  <SelectItem value="transfer_value">Transfer Value</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="toolName">Tool Name (optional)</Label>
            <Input
              id="toolName"
              placeholder="e.g., github_create_pr"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 grid gap-2">
              <Label htmlFor="domainMatch">Domain Match (optional)</Label>
              <Input
                id="domainMatch"
                placeholder="e.g., github.com"
                value={domainMatch}
                onChange={(e) => setDomainMatch(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label>Match Type</Label>
              <Select value={domainMatchType} onValueChange={setDomainMatchType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="suffix">Suffix</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="priority">Priority (0-100, higher = checked first)</Label>
            <Input
              id="priority"
              type="number"
              min="0"
              max="100"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
