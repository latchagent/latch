"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, ShieldCheck, ShieldX, ShieldAlert, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ParsedRule {
  effect: "allow" | "deny" | "require_approval";
  action_class: string;
  tool_name: string | null;
  domain_match: string | null;
  recipient_match: string | null;
  description: string;
}

interface NaturalLanguageRulesProps {
  workspaceId: string;
}

export function NaturalLanguageRules({ workspaceId }: NaturalLanguageRulesProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parsedRules, setParsedRules] = useState<ParsedRule[] | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleParse = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/rules/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to parse rules");
      }

      setParsedRules(data.rules);
      setExplanation(data.explanation);
      setShowConfirm(true);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to parse rules",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!parsedRules) return;

    setIsSaving(true);
    try {
      // Save each rule
      for (const rule of parsedRules) {
        // Build request body, only including non-null values
        const ruleData: Record<string, unknown> = {
          workspaceId,
          name: rule.description,
          effect: rule.effect,
          actionClass: rule.action_class,
        };
        
        if (rule.tool_name) {
          ruleData.toolName = rule.tool_name;
        }
        
        if (rule.domain_match) {
          // Handle wildcard prefix
          const domain = rule.domain_match.startsWith("*.") 
            ? rule.domain_match.slice(2) 
            : rule.domain_match;
          ruleData.domainMatch = domain;
          ruleData.domainMatchType = rule.domain_match.startsWith("*.") ? "suffix" : "exact";
        }

        if (rule.recipient_match) {
          ruleData.recipientMatch = rule.recipient_match.toLowerCase();
        }

        const response = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ruleData),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create rule");
        }
      }

      toast({
        title: "Rules created",
        description: `Successfully created ${parsedRules.length} rule${parsedRules.length > 1 ? "s" : ""}`,
      });

      setShowConfirm(false);
      setPrompt("");
      setParsedRules(null);
      setExplanation(null);
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save rules",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Create rules with natural language
          </CardTitle>
          <CardDescription>
            Describe what you want to allow or block, and we&apos;ll create the rules for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              placeholder="e.g., Allow the agent to read any GitHub repo, but require approval before creating PRs or merging"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Examples: &quot;Block all shell commands&quot; • &quot;Require approval for external emails&quot; • &quot;Allow reads but block writes to production&quot;
              </p>
              <Button
                onClick={handleParse}
                disabled={!prompt.trim() || isLoading}
                size="sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Create Rules
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Rules</DialogTitle>
            <DialogDescription>
              Review the rules that will be created based on your description.
            </DialogDescription>
          </DialogHeader>

          {explanation && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              {explanation}
            </div>
          )}

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {parsedRules?.map((rule, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <div className="mt-0.5">
                  {rule.effect === "allow" && (
                    <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  )}
                  {rule.effect === "deny" && (
                    <ShieldX className="h-5 w-5 text-red-500" />
                  )}
                  {rule.effect === "require_approval" && (
                    <ShieldAlert className="h-5 w-5 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{rule.description}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setParsedRules((prev) => {
                          if (!prev) return prev;
                          return prev.filter((_, idx) => idx !== i);
                        });
                      }}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <EffectBadge effect={rule.effect} />
                    <Badge variant="outline" className="text-xs">
                      {rule.action_class.toUpperCase()}
                    </Badge>
                    {rule.tool_name && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        {rule.tool_name}
                      </Badge>
                    )}
                    {rule.domain_match && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        @{rule.domain_match}
                      </Badge>
                    )}
                    {rule.recipient_match && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        {rule.recipient_match}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || (parsedRules?.length ?? 0) === 0}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Create {parsedRules?.length} Rule{parsedRules?.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EffectBadge({ effect }: { effect: string }) {
  switch (effect) {
    case "allow":
      return <Badge variant="success" className="text-xs">Allow</Badge>;
    case "deny":
      return <Badge variant="destructive" className="text-xs">Deny</Badge>;
    case "require_approval":
      return <Badge variant="warning" className="text-xs">Require Approval</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">{effect}</Badge>;
  }
}
