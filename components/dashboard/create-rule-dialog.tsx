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
import { Switch } from "@/components/ui/switch";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Upstream {
  id: string;
  name: string;
  tools?: unknown[] | null;
}

interface CreateRuleDialogProps {
  workspaceId: string;
  upstreams?: Upstream[];
}

export function CreateRuleDialog({ workspaceId, upstreams }: CreateRuleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState("");
  const [effect, setEffect] = useState<string>("allow");
  const [actionClass, setActionClass] = useState<string>("any");
  const [upstreamId, setUpstreamId] = useState<string>("any");
  const [toolName, setToolName] = useState("");
  const [domainMatch, setDomainMatch] = useState("");
  const [domainMatchType, setDomainMatchType] = useState<string>("exact");
  
  // Smart rules
  const [isSmartRule, setIsSmartRule] = useState(false);
  const [smartCondition, setSmartCondition] = useState("");

  const selectedUpstream =
    upstreamId === "any" ? undefined : upstreams?.find((u) => u.id === upstreamId);

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

  const isOpenClawUpstream = Boolean(
    selectedUpstream?.name && selectedUpstream.name.toLowerCase().includes("openclaw")
  );

  const toolOptions: string[] = (() => {
    if (isOpenClawUpstream) return openclawNativeToolOptions;

    if (!selectedUpstream?.tools || !Array.isArray(selectedUpstream.tools)) return [];
    const names: string[] = [];
    for (const t of selectedUpstream.tools) {
      if (!t || typeof t !== "object") continue;
      const rec = t as Record<string, unknown>;
      if (typeof rec.name === "string") names.push(rec.name);
    }
    return names.sort((a, b) => a.localeCompare(b));
  })();

  const handleSubmit = async () => {
    // Validate smart rules have a condition
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
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: name || undefined,
          effect,
          actionClass: isSmartRule ? "any" : actionClass, // Smart rules match any action
          upstreamId: upstreamId === "any" ? undefined : upstreamId,
          toolName: toolName || undefined,
          domainMatch: isSmartRule ? undefined : domainMatch || undefined,
          domainMatchType: isSmartRule ? undefined : (domainMatch ? domainMatchType : undefined),
          smartCondition: isSmartRule ? smartCondition.trim() : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create rule");
      }

      toast({
        title: "Rule created",
        description: isSmartRule 
          ? "Smart rule created. It will use AI to evaluate tool calls."
          : "The policy rule has been created successfully.",
      });
      setOpen(false);
      router.refresh();

      // Reset form
      setName("");
      setEffect("allow");
      setActionClass("any");
      setUpstreamId("any");
      setToolName("");
      setDomainMatch("");
      setIsSmartRule(false);
      setSmartCondition("");
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
          {/* Smart Rule Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <div>
                <Label htmlFor="smart-rule" className="text-sm font-medium">
                  Smart Rule (AI-powered)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Use natural language to define when this rule triggers
                </p>
              </div>
            </div>
            <Switch
              id="smart-rule"
              checked={isSmartRule}
              onCheckedChange={setIsSmartRule}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              placeholder={isSmartRule ? "e.g., Block sensitive file searches" : "e.g., Allow GitHub API"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

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

          {/* Smart Rule Condition */}
          {isSmartRule && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-amber-800 dark:text-amber-300">Smart rule caution</div>
              <div className="mt-1">
                Smart rules run before deterministic rules. If you leave <span className="font-mono">Tool</span> and <span className="font-mono">Upstream</span> blank,
                this rule may apply to <span className="font-medium">all</span> requests.
              </div>
            </div>
          )}

          {isSmartRule && (
            <div className="grid gap-2">
              <Label htmlFor="smartCondition">
                Condition <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="smartCondition"
                placeholder="Describe when this rule should trigger, e.g.:&#10;&#10;• Searches targeting sensitive files like .env, passwords, SSH keys, or credentials&#10;• File operations outside the project directory&#10;• Requests that could expose API keys or secrets"
                value={smartCondition}
                onChange={(e) => setSmartCondition(e.target.value)}
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                An AI will evaluate each tool call against this condition. Be specific about what should trigger the rule.
              </p>
            </div>
          )}

          {/* Pattern-based fields (hidden for smart rules) */}
          {!isSmartRule && (
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
          )}

          <div className="grid gap-2">
            <Label>Upstream (optional)</Label>
            <Select value={upstreamId} onValueChange={setUpstreamId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any upstream</SelectItem>
                {(upstreams || []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="toolName">Tool (optional)</Label>
            {toolOptions.length > 0 ? (
              <Select value={toolName || "any"} onValueChange={(v) => setToolName(v === "any" ? "" : v)}>
                <SelectTrigger className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any tool</SelectItem>
                  {toolOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="toolName"
                placeholder={isOpenClawUpstream ? "e.g., openclaw:browser" : "e.g., github_create_pr"}
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                className="font-mono"
              />
            )}
            {isOpenClawUpstream ? (
              <p className="text-xs text-muted-foreground">
                For OpenClaw native tools, use the <span className="font-mono">openclaw:*</span> tool names.
              </p>
            ) : null}
          </div>

          {/* Domain match only for pattern rules */}
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
                  <Label htmlFor="domainMatch">Domain / Host match (optional)</Label>
                  <Input
                    id="domainMatch"
                    placeholder={toolName === "openclaw:browser" ? "e.g., linkedin.com" : "e.g., github.com"}
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
            </div>
          )}

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
