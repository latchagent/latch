"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Rule {
  id: string;
  name: string | null;
  effect: string;
  actionClass: string;
  toolName: string | null;
  domainMatch: string | null;
  domainMatchType: string | null;
  priority: number;
  enabled: boolean;
}

interface RuleActionsProps {
  rule: Rule;
}

export function RuleActions({ rule }: RuleActionsProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/rules/${rule.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete");
      }

      toast({ title: "Rule deleted" });
      setShowDeleteDialog(false);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete rule",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleEnabled = async () => {
    try {
      const response = await fetch(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update");
      }

      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update rule",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={rule.enabled}
          onCheckedChange={handleToggleEnabled}
        />
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
      </div>

      <EditRuleDialog
        rule={rule}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this rule? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
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

function EditRuleDialog({
  rule,
  open,
  onOpenChange,
}: {
  rule: Rule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(rule.name || "");
  const [effect, setEffect] = useState(rule.effect);
  const [actionClass, setActionClass] = useState(rule.actionClass);
  const [toolName, setToolName] = useState(rule.toolName || "");
  const [domainMatch, setDomainMatch] = useState(rule.domainMatch || "");
  const [priority, setPriority] = useState(rule.priority.toString());

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          effect,
          actionClass,
          toolName: toolName || null,
          domainMatch: domainMatch || null,
          priority: parseInt(priority) || 50,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update");
      }

      toast({ title: "Rule updated" });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update rule",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Rule</DialogTitle>
          <DialogDescription>
            Modify this policy rule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional rule name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
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

            <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="toolName">Tool Name (optional)</Label>
            <Input
              id="toolName"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="e.g., shell.exec"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domainMatch">Domain Match (optional)</Label>
            <Input
              id="domainMatch"
              value={domainMatch}
              onChange={(e) => setDomainMatch(e.target.value)}
              placeholder="e.g., github.com"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority (0-100)</Label>
            <Input
              id="priority"
              type="number"
              min="0"
              max="100"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Higher priority rules are evaluated first
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
