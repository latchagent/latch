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
import { SyncToolsButton } from "@/components/dashboard/sync-tools-button";
import { ImportMcpConfigDialog } from "@/components/dashboard/import-mcp-config-dialog";
import { ExportConfigDialog } from "@/components/dashboard/export-config-dialog";
import { UpstreamActions } from "@/components/dashboard/upstream-actions";

export default async function UpstreamsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspaceId = workspacesList[0].workspace.id;
  const cloudUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
        <div className="flex items-center gap-2">
          <ImportMcpConfigDialog workspaceId={workspaceId} />
          <CreateUpstreamDialog workspaceId={workspaceId} />
        </div>
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
                  <TableHead>Tools</TableHead>
                  <TableHead className="w-28">Sync</TableHead>
                  <TableHead className="w-28">Export</TableHead>
                  <TableHead className="w-12"></TableHead>
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
                      {upstream.baseUrl || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-xs">
                        {upstream.transport}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {upstream.headers && Object.keys(upstream.headers).length > 0 ? (
                        <span className="flex items-center gap-1 text-xs">
                          <Lock className="h-3 w-3 text-emerald-500" />
                          headers
                        </span>
                      ) : upstream.authType === "none" ? (
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
                    <TableCell className="text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono">
                          {Array.isArray(upstream.tools) ? upstream.tools.length : 0}
                        </span>
                        {upstream.toolsSyncError ? (
                          <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-[220px]">
                            {upstream.toolsSyncError}
                          </span>
                        ) : upstream.toolsSyncedAt ? (
                          <span className="text-xs text-muted-foreground">
                            {new Date(upstream.toolsSyncedAt).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <SyncToolsButton
                        upstreamId={upstream.id}
                        disabled={upstream.transport !== "http" || !upstream.baseUrl}
                      />
                    </TableCell>
                    <TableCell>
                      <ExportConfigDialog
                        cloudUrl={cloudUrl}
                        workspaceId={workspaceId}
                        upstream={{
                          id: upstream.id,
                          name: upstream.name,
                          transport: upstream.transport,
                          baseUrl: upstream.baseUrl,
                          headerNames: upstream.headers ? Object.keys(upstream.headers) : [],
                          stdioCommand: upstream.stdioCommand,
                          stdioArgs: upstream.stdioArgs,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <UpstreamActions
                        upstream={{
                          id: upstream.id,
                          name: upstream.name,
                          transport: upstream.transport,
                          baseUrl: upstream.baseUrl,
                          headers: upstream.headers,
                          authType: upstream.authType,
                          authValue: upstream.authValue,
                          stdioCommand: upstream.stdioCommand,
                          stdioArgs: upstream.stdioArgs,
                        }}
                      />
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
