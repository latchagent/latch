import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { getPendingApprovals } from "@/lib/proxy/approvals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions } from "@/components/dashboard/approval-actions";
import { ShieldAlert, Clock, AlertTriangle } from "lucide-react";

export default async function ApprovalsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspaceId = workspacesList[0].workspace.id;
  const pendingApprovals = await getPendingApprovals(workspaceId);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-2 text-muted-foreground">
          Review and approve pending action requests from your agents.
        </p>
      </div>

      {pendingApprovals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No pending approvals</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              All caught up! New approval requests will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingApprovals.map(({ approvalRequest, request }) => (
            <Card key={approvalRequest.id} className="overflow-hidden">
              <div className="flex">
                {/* Risk indicator strip */}
                <div
                  className={`w-1 ${
                    request.riskLevel === "critical"
                      ? "bg-red-500"
                      : request.riskLevel === "high"
                      ? "bg-orange-500"
                      : request.riskLevel === "med"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                />
                <div className="flex-1">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 font-mono">
                          {request.toolName}
                          <RiskBadge level={request.riskLevel} />
                        </CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(approvalRequest.createdAt)}
                          </span>
                          <span>•</span>
                          <span>{request.actionClass.toUpperCase()}</span>
                          {(request.resource as { domain?: string })?.domain && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-xs">
                                {(request.resource as { domain: string }).domain}
                              </span>
                            </>
                          )}
                        </CardDescription>
                      </div>
                      <Badge variant="warning" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Pending
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Risk Flags */}
                    {request.riskFlags ? (
                      <RiskFlagsDisplay flags={request.riskFlags as Record<string, boolean>} />
                    ) : null}

                    {/* Redacted Args */}
                    {request.argsRedacted ? (
                      <div className="rounded-lg bg-muted p-4">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Request Details (redacted)
                        </p>
                        <pre className="text-xs overflow-auto max-h-32">
                          {JSON.stringify(request.argsRedacted, null, 2)}
                        </pre>
                      </div>
                    ) : null}

                    {/* Expiration warning */}
                    <p className="text-xs text-muted-foreground">
                      Expires {formatExpiry(approvalRequest.expiresAt)}
                    </p>

                    {/* Actions */}
                    <ApprovalActions
                      approvalId={approvalRequest.id}
                      toolName={request.toolName}
                    />
                  </CardContent>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RiskFlagsDisplay({ flags }: { flags: Record<string, boolean> }) {
  const activeFlags = Object.entries(flags).filter(([, v]) => v);
  if (activeFlags.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-2">
      {activeFlags.map(([key]) => (
        <Badge key={key} variant="outline" className="text-xs">
          {key.replace(/_/g, " ")}
        </Badge>
      ))}
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  switch (level) {
    case "low":
      return <Badge variant="outline" className="text-emerald-600">Low Risk</Badge>;
    case "med":
      return <Badge variant="outline" className="border-amber-500 text-amber-600">Medium Risk</Badge>;
    case "high":
      return <Badge variant="outline" className="border-orange-500 text-orange-600">High Risk</Badge>;
    case "critical":
      return <Badge variant="destructive">Critical Risk</Badge>;
    default:
      return <Badge variant="outline">{level}</Badge>;
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hours ago`;
  return new Date(date).toLocaleDateString();
}

function formatExpiry(date: Date): string {
  const now = new Date();
  const expiry = new Date(date);
  const diff = expiry.getTime() - now.getTime();
  const hours = Math.floor(diff / (60 * 60 * 1000));

  if (hours < 1) return "in less than an hour";
  if (hours < 24) return `in ${hours} hours`;
  return `on ${expiry.toLocaleDateString()}`;
}
