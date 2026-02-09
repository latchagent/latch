import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requests, agents, upstreams } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function AuditDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspaceId = workspacesList[0].workspace.id;

  const [row] = await db
    .select({
      request: requests,
      agent: agents,
      upstream: upstreams,
    })
    .from(requests)
    .leftJoin(agents, eq(requests.agentId, agents.id))
    .leftJoin(upstreams, eq(requests.upstreamId, upstreams.id))
    .where(eq(requests.id, params.id));

  if (!row) return notFound();
  if (row.request.workspaceId !== workspaceId) return notFound();

  const res = row.request.resource as unknown;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Audit Detail</h1>
          <p className="mt-2 text-muted-foreground">Full request details (redacted).</p>
        </div>
        <Link href="/audit" className="text-sm text-muted-foreground hover:text-foreground">
          Back to audit
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-sm break-all">{row.request.toolName}</CardTitle>
          <CardDescription>
            {new Date(row.request.createdAt).toLocaleString()} • {row.upstream?.name || "—"} • {row.agent?.name || "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="uppercase text-xs">
              {row.request.actionClass}
            </Badge>
            <Badge variant={row.request.decision === "denied" ? "destructive" : row.request.decision === "approval_required" ? "warning" : "success"}>
              {row.request.decision}
            </Badge>
            <Badge variant="outline" className="text-xs">
              risk: {row.request.riskLevel}
            </Badge>
          </div>

          {row.request.denialReason ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">Reason</div>
              <div className="text-sm">{row.request.denialReason}</div>
            </div>
          ) : null}

          {res ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">Resource</div>
              <pre className="mt-2 overflow-auto rounded bg-muted p-4 text-xs">{JSON.stringify(res, null, 2)}</pre>
            </div>
          ) : null}

          {row.request.riskFlags ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">Risk Flags</div>
              <pre className="mt-2 overflow-auto rounded bg-muted p-4 text-xs">{JSON.stringify(row.request.riskFlags, null, 2)}</pre>
            </div>
          ) : null}

          {row.request.argsRedacted ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">Args (redacted)</div>
              <pre className="mt-2 overflow-auto rounded bg-muted p-4 text-xs">{JSON.stringify(row.request.argsRedacted, null, 2)}</pre>
            </div>
          ) : null}

          <div className="grid gap-2">
            <div className="text-xs font-medium text-muted-foreground">IDs</div>
            <div className="text-xs font-mono text-muted-foreground break-all">request: {row.request.id}</div>
            <div className="text-xs font-mono text-muted-foreground break-all">upstream: {row.request.upstreamId}</div>
            <div className="text-xs font-mono text-muted-foreground break-all">agent: {row.request.agentId || "—"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
