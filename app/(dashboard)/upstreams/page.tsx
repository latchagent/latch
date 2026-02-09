import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { upstreams } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Server } from "lucide-react";
import { CreateUpstreamDialog } from "@/components/dashboard/create-upstream-dialog";
import { ImportMcpConfigDialog } from "@/components/dashboard/import-mcp-config-dialog";
import { UpstreamTable } from "./upstream-table";

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

  const isOpenClaw = (name: string) => name.toLowerCase().includes("openclaw");
  const openclawUpstreams = upstreamList.filter((u) => isOpenClaw(u.name));
  const mcpUpstreams = upstreamList.filter((u) => !isOpenClaw(u.name));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Upstreams</h1>
          <p className="mt-2 text-muted-foreground">
            Configure integrations: MCP upstream servers and OpenClaw-native tool approvals.
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
            Integrations
          </CardTitle>
          <CardDescription>
            MCP upstream servers, plus OpenClaw-native approvals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upstreamList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No integrations configured yet. Add one to start routing requests.
            </div>
          ) : (
            <div className="space-y-8">
              {openclawUpstreams.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">OpenClaw (native tools)</div>
                  <UpstreamTable upstreamList={openclawUpstreams} cloudUrl={cloudUrl} workspaceId={workspaceId} />
                </div>
              ) : null}

              {mcpUpstreams.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">MCP upstream servers</div>
                  <UpstreamTable upstreamList={mcpUpstreams} cloudUrl={cloudUrl} workspaceId={workspaceId} />
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
