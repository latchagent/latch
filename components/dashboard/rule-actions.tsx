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
import { Textarea } from "@/components/ui/textarea";
import { MoreHorizontal, Pencil, Trash2, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Rule {
  id: string;
  name: string | null;
  effect: string;
  actionClass: string;
  toolName: string | null;
  domainMatch: string | null;
  domainMatchType: string | null;
  smartCondition: string | null;
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

  const openclawNativeToolOptions: string[] = [
    "openclaw:read",
    "openclaw:write",
    "openclaw:edit",
    "openclaw:exec",
    "openclaw:process",
    "openclaw:browser",
    "openclaw:web_search",
    "openclaw:web_fetch",
    "openclaw:message",
    "openclaw:tts",
    "openclaw:cron",
    "openclaw:sessions_list",
    "openclaw:sessions_history",
    "openclaw:sessions_send",
    "openclaw:sessions_spawn",
    "openclaw:agents_list",
    "openclaw:session_status",
    "openclaw:nodes",
    "openclaw:canvas",
    "openclaw:image",
    "openclaw:gateway",
    "openclaw:memory_search",
    "openclaw:memory_get",
  ];

  const isOpenClawTool = toolName.startsWith("openclaw:") || (rule.toolName || "").startsWith("openclaw:");
  const showOpenClawToolPicker = isOpenClawTool;

  const [domainMatch, setDomainMatch] = useState(rule.domainMatch || "");
  const [domainMatchType, setDomainMatchType] = useState(rule.domainMatchType || "exact");
  const [priority, setPriority] = useState(rule.priority.toString());
  const [isSmartRule, setIsSmartRule] = useState(!!rule.smartCondition);
  const [smartCondition, setSmartCondition] = useState(rule.smartCondition || "");

  const handleSave = async () => {
    if (isSmartRule && !smartCondition.trim()) {
      toast({
        title: "Error",
        description: "Smart rules require a condition",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          effect,
          actionClass: isSmartRule ? "any" : actionClass,
          toolName: toolName || null,
          domainMatch: isSmartRule ? null : (domainMatch || null),
          domainMatchType: isSmartRule ? null : (domainMatch ? domainMatchType : null),
          smartCondition: isSmartRule ? smartCondition.trim() : null,
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
          {/* Smart Rule Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <div>
                <Label htmlFor="edit-smart-rule" className="text-sm font-medium">
                  Smart Rule (AI-powered)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Use natural language to define when this rule triggers
                </p>
              </div>
            </div>
            <Switch
              id="edit-smart-rule"
              checked={isSmartRule}
              onCheckedChange={setIsSmartRule}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional rule name"
            />
          </div>

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

          {/* Smart Rule Condition */}
          {isSmartRule && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-amber-800 dark:text-amber-300">Smart rule caution</div>
              <div className="mt-1">
                Smart rules run before deterministic rules. If you leave <span className="font-mono">Tool</span> blank,
                this rule may apply to <span className="font-medium">all</span> requests.
              </div>
            </div>
          )}

          {isSmartRule && (
            <div className="space-y-2">
              <Label htmlFor="edit-smartCondition">
                Condition <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-smartCondition"
                placeholder="Describe when this rule should trigger, e.g.:&#10;&#10;• Searches targeting sensitive files like .env, passwords, SSH keys&#10;• File operations outside the project directory"
                value={smartCondition}
                onChange={(e) => setSmartCondition(e.target.value)}
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                An AI will evaluate each tool call against this condition.
              </p>
            </div>
          )}

          {/* Pattern-based fields (hidden for smart rules) */}
          {!isSmartRule && (
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
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-toolName">Tool (optional)</Label>
            {showOpenClawToolPicker ? (
              <Select
                value={toolName || "any"}
                onValueChange={(v) => setToolName(v === "any" ? "" : v)}
              >
                <SelectTrigger className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any tool</SelectItem>
                  {openclawNativeToolOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="edit-toolName"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder={isOpenClawTool ? "e.g., openclaw:browser" : "e.g., shell_exec"}
                className="font-mono"
              />
            )}
            {showOpenClawToolPicker ? (
              <p className="text-xs text-muted-foreground">
                OpenClaw native tools use <span className="font-mono">openclaw:*</span> names.
              </p>
            ) : null}
          </div>

          {!isSmartRule && (
            <div className="space-y-3">
              {/* Browser presets for OpenClaw */}
              {toolName === "openclaw:browser" ? (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Browser presets (deterministic)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEffect("require_approval");
                        setActionClass("submit");
                        setDomainMatchType("suffix");
                        if (!domainMatch) setDomainMatch("linkedin.com");
                      }}
                    >
                      Require approval for domain
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEffect("deny");
                        setActionClass("submit");
                        setDomainMatchType("suffix");
                      }}
                    >
                      Block domain
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEffect("allow");
                        setActionClass("submit");
                        setDomainMatchType("suffix");
                      }}
                    >
                      Allow domain
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tip: use <span className="font-mono">suffix</span> match for domains like
                    <span className="font-mono"> linkedin.com</span> to include subdomains.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 grid gap-2">
                  <Label htmlFor="edit-domainMatch">Domain / Host match (optional)</Label>
                  <Input
                    id="edit-domainMatch"
                    value={domainMatch}
                    onChange={(e) => setDomainMatch(e.target.value)}
                    placeholder={toolName === "openclaw:browser" ? "e.g., linkedin.com" : "e.g., github.com"}
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
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-priority">Priority (0-100)</Label>
            <Input
              id="edit-priority"
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
