import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { upstreams } from "@/lib/db/schema";
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
import { Server, Lock, LockOpen } from "lucide-react";
import { CreateUpstreamDialog } from "@/components/dashboard/create-upstream-dialog";
import { CopyableId } from "@/components/ui/copy-button";

export default async function UpstreamsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspaceId = workspacesList[0].workspace.id;

  const upstreamList = await db
    .select()
    .from(upstreams)
    .where(eq(upstreams.workspaceId, workspaceId))
    .orderBy(desc(upstreams.createdAt));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Upstreams</h1>
          <p className="mt-2 text-muted-foreground">
            Configure upstream MCP servers that the proxy forwards requests to.
          </p>
        </div>
        <CreateUpstreamDialog workspaceId={workspaceId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Upstream Servers
          </CardTitle>
          <CardDescription>
            The proxy acts as an MCP client to these servers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upstreamList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No upstreams configured yet. Add one to start routing requests.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upstreamList.map((upstream) => (
                  <TableRow key={upstream.id}>
                    <TableCell className="font-medium">{upstream.name}</TableCell>
                    <TableCell>
                      <CopyableId id={upstream.id} />
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[300px] truncate">
                      {upstream.baseUrl}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-xs">
                        {upstream.transport}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {upstream.authType === "none" ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <LockOpen className="h-3 w-3" />
                          None
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs">
                          <Lock className="h-3 w-3 text-emerald-500" />
                          {upstream.authType}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(upstream.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
