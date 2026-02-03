import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
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
import { Bot, Key, Clock } from "lucide-react";
import { CreateAgentDialog } from "@/components/dashboard/create-agent-dialog";
import { CopyableId } from "@/components/ui/copy-button";

export default async function AgentsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspaceId = workspacesList[0].workspace.id;

  const agentList = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId))
    .orderBy(desc(agents.createdAt));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-2 text-muted-foreground">
            Manage agent connections to your MCP proxy.
          </p>
        </div>
        <CreateAgentDialog workspaceId={workspaceId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Registered Agents
          </CardTitle>
          <CardDescription>
            Each agent uses a unique client key to authenticate with the proxy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No agents configured yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Client Key</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentList.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>
                      <CopyableId id={agent.id} />
                    </TableCell>
                    <TableCell>
                      {agent.clientKeyHash ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          <Key className="mr-1 h-3 w-3" />
                          ••••••••
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {agent.lastSeenAt ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(agent.lastSeenAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(agent.createdAt).toLocaleDateString()}
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

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
