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
} from "@/components/ui/dialog";
import { Check, X, Clock, Copy, CheckCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ApprovalActionsProps {
  approvalId: string;
  toolName: string;
}

export function ApprovalActions({ approvalId, toolName }: ApprovalActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleApprove = async (leaseDuration?: number) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/approvals/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId,
          createLease: !!leaseDuration,
          leaseDurationMinutes: leaseDuration,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to approve");
      }

      setApprovalToken(data.token);
      setShowTokenDialog(true);
      // Don't refresh yet - wait until user closes the token dialog
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = async (createRule?: boolean) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/approvals/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId,
          createDenyRule: createRule,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to deny");
      }

      toast({
        title: "Denied",
        description: createRule
          ? "Request denied and rule created to block similar actions"
          : "Request denied",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to deny",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToken = () => {
    if (approvalToken) {
      navigator.clipboard.writeText(approvalToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => handleApprove()}
          disabled={isLoading}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Check className="mr-2 h-4 w-4" />
          Approve Once
        </Button>
        <Button
          variant="outline"
          onClick={() => handleApprove(15)}
          disabled={isLoading}
        >
          <Clock className="mr-2 h-4 w-4" />
          Approve 15 min
        </Button>
        <Button
          variant="outline"
          onClick={() => handleApprove(60)}
          disabled={isLoading}
        >
          <Clock className="mr-2 h-4 w-4" />
          Approve 1 hour
        </Button>
        <Button
          variant="outline"
          onClick={() => handleDeny()}
          disabled={isLoading}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <X className="mr-2 h-4 w-4" />
          Deny
        </Button>
        <Button
          variant="ghost"
          onClick={() => handleDeny(true)}
          disabled={isLoading}
          className="text-red-600 hover:text-red-700"
        >
          Deny + Block Future
        </Button>
      </div>

      <Dialog open={showTokenDialog} onOpenChange={(open) => {
        setShowTokenDialog(open);
        if (!open) {
          // Refresh the page when dialog closes to update the approvals list
          router.refresh();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Approved</DialogTitle>
            <DialogDescription>
              Share this single-use token with the agent to retry the action.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Approval Token for {toolName}
              </p>
              <code className="block break-all text-sm">{approvalToken}</code>
            </div>
            <Button onClick={copyToken} variant="outline" className="w-full">
              {copied ? (
                <>
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Token
                </>
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTokenDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
