import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requests, agents, upstreams } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck, ShieldX, ShieldAlert } from "lucide-react";

export default async function AuditPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspaceId = workspacesList[0].workspace.id;

  const requestList = await db
    .select({
      request: requests,
      agent: agents,
      upstream: upstreams,
    })
    .from(requests)
    .leftJoin(agents, eq(requests.agentId, agents.id))
    .leftJoin(upstreams, eq(requests.upstreamId, upstreams.id))
    .where(eq(requests.workspaceId, workspaceId))
    .orderBy(desc(requests.createdAt))
    .limit(100);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
        <p className="mt-2 text-muted-foreground">
          Complete history of all requests processed by the proxy.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request History</CardTitle>
          <CardDescription>
            Showing the last 100 requests. All data is logged with redacted arguments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No requests logged yet. Configure an agent to start.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Status</TableHead>
                    <TableHead>Tool</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Upstream</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestList.map(({ request, agent, upstream }) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <DecisionIcon decision={request.decision} />
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {request.toolName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs uppercase">
                          {request.actionClass}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <RiskBadge level={request.riskLevel} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {agent?.name || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {upstream?.name || "—"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs font-mono">
                        {(request.resource as { domain?: string })?.domain ||
                          (request.resource as { urlHost?: string })?.urlHost ||
                          "—"}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {request.denialReason || request.summary || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(request.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
      return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
    case "denied":
      return <ShieldX className="h-4 w-4 text-red-500" />;
    case "approval_required":
      return <ShieldAlert className="h-4 w-4 text-amber-500" />;
    default:
      return null;
  }
}

function RiskBadge({ level }: { level: string }) {
  switch (level) {
    case "low":
      return <Badge variant="outline" className="text-xs">Low</Badge>;
    case "med":
      return <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">Med</Badge>;
    case "high":
      return <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs">High</Badge>;
    case "critical":
      return <Badge variant="destructive" className="text-xs">Critical</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{level}</Badge>;
  }
}

function formatTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
