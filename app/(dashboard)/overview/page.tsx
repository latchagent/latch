import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requests, approvalRequests, agents, policyRules } from "@/lib/db/schema";
import { eq, and, gte, desc, count } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Activity,
  Bot,
  ScrollText,
  Terminal,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { CopyableId } from "@/components/ui/copy-button";

export default async function OverviewPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) {
    redirect("/onboarding");
  }

  const workspaceId = workspacesList[0].workspace.id;
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get stats
  const [
    totalRequests24h,
    allowedRequests24h,
    deniedRequests24h,
    pendingApprovals,
    activeAgents,
    totalRules,
    recentRequests,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(requests)
      .where(
        and(
          eq(requests.workspaceId, workspaceId),
          gte(requests.createdAt, last24h)
        )
      )
      .then((r) => r[0]?.count || 0),
    db
      .select({ count: count() })
      .from(requests)
      .where(
        and(
          eq(requests.workspaceId, workspaceId),
          eq(requests.decision, "allowed"),
          gte(requests.createdAt, last24h)
        )
      )
      .then((r) => r[0]?.count || 0),
    db
      .select({ count: count() })
      .from(requests)
      .where(
        and(
          eq(requests.workspaceId, workspaceId),
          eq(requests.decision, "denied"),
          gte(requests.createdAt, last24h)
        )
      )
      .then((r) => r[0]?.count || 0),
    db
      .select({ count: count() })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, workspaceId),
          eq(approvalRequests.status, "pending")
        )
      )
      .then((r) => r[0]?.count || 0),
    db
      .select({ count: count() })
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          gte(agents.lastSeenAt, last7d)
        )
      )
      .then((r) => r[0]?.count || 0),
    db
      .select({ count: count() })
      .from(policyRules)
      .where(eq(policyRules.workspaceId, workspaceId))
      .then((r) => r[0]?.count || 0),
    db
      .select()
      .from(requests)
      .where(eq(requests.workspaceId, workspaceId))
      .orderBy(desc(requests.createdAt))
      .limit(10),
  ]);

  const approvalRate =
    totalRequests24h > 0
      ? Math.round((allowedRequests24h / totalRequests24h) * 100)
      : 100;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-muted-foreground">
          Monitor your MCP proxy activity and pending approvals.
        </p>
      </div>

      {/* CLI Configuration Card */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4" />
            CLI Configuration
          </CardTitle>
          <CardDescription>
            Use these values to configure the Latch CLI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Workspace ID</p>
              <CopyableId id={workspaceId} truncate={false} />
            </div>
            <div className="flex gap-2">
              <Link
                href="/upstreams"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Get Upstream ID <ArrowRight className="h-3 w-3" />
              </Link>
              <span className="text-muted-foreground">•</span>
              <Link
                href="/agents"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Get Agent Key <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRequests24h}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingApprovals}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAgents}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Policy Rules</CardTitle>
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRules}</div>
            <p className="text-xs text-muted-foreground">Active rules</p>
          </CardContent>
        </Card>
      </div>

      {/* Decision Breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Allowed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{allowedRequests24h}</div>
            <p className="text-xs text-muted-foreground">{approvalRate}% of requests</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {totalRequests24h - allowedRequests24h - deniedRequests24h}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting human review</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ShieldX className="h-4 w-4 text-red-500" />
              Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{deniedRequests24h}</div>
            <p className="text-xs text-muted-foreground">Blocked by policy</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 10 requests processed by the proxy</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No requests yet. Configure an agent to start.
            </div>
          ) : (
            <div className="space-y-4">
              {recentRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    <DecisionIcon decision={req.decision} />
                    <div>
                      <p className="font-medium font-mono text-sm">{req.toolName}</p>
                      <p className="text-xs text-muted-foreground">
                        {req.actionClass.toUpperCase()} • {formatTime(req.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge level={req.riskLevel} />
                    <DecisionBadge decision={req.decision} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DecisionIcon({ decision }: { decision: string }) {
  switch (decision) {
    case "allowed":
      return <ShieldCheck className="h-5 w-5 text-emerald-500" />;
    case "denied":
      return <ShieldX className="h-5 w-5 text-red-500" />;
    case "approval_required":
      return <ShieldAlert className="h-5 w-5 text-amber-500" />;
    default:
      return <Activity className="h-5 w-5 text-muted-foreground" />;
  }
}

function DecisionBadge({ decision }: { decision: string }) {
  switch (decision) {
    case "allowed":
      return <Badge variant="success">Allowed</Badge>;
    case "denied":
      return <Badge variant="destructive">Denied</Badge>;
    case "approval_required":
      return <Badge variant="warning">Pending</Badge>;
    default:
      return <Badge variant="secondary">{decision}</Badge>;
  }
}

function RiskBadge({ level }: { level: string }) {
  switch (level) {
    case "low":
      return <Badge variant="outline">Low</Badge>;
    case "med":
      return <Badge variant="outline" className="border-amber-500 text-amber-600">Med</Badge>;
    case "high":
      return <Badge variant="outline" className="border-orange-500 text-orange-600">High</Badge>;
    case "critical":
      return <Badge variant="outline" className="border-red-500 text-red-600">Critical</Badge>;
    default:
      return <Badge variant="outline">{level}</Badge>;
  }
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(date).toLocaleDateString();
}
