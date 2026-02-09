import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { getTelegramLink } from "@/lib/telegram/bot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bell, Key, Building2 } from "lucide-react";
import { TelegramConnect } from "@/components/dashboard/telegram-connect";

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspace = workspacesList[0].workspace;
  const telegramLink = await getTelegramLink(session.user.id);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account and workspace settings for MCP + OpenClaw approvals.
        </p>
      </div>

      {/* Workspace Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Workspace
          </CardTitle>
          <CardDescription>
            Your current workspace configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Workspace Name</p>
              <p className="text-sm text-muted-foreground">{workspace.name}</p>
            </div>
            <Badge variant="outline">{workspacesList[0].role}</Badge>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">Workspace ID</p>
            <p className="text-sm font-mono text-muted-foreground">{workspace.id}</p>
          </div>
        </CardContent>
      </Card>

      {/* Telegram Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Telegram Notifications
          </CardTitle>
          <CardDescription>
            Receive approval requests directly in Telegram with interactive buttons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TelegramConnect
            isLinked={!!telegramLink?.verified}
            telegramUsername={telegramLink?.username}
          />
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Proxy Configuration
          </CardTitle>
          <CardDescription>
            Use these settings to configure MCP clients and OpenClaw.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Proxy Endpoint</p>
            <code className="mt-1 block rounded bg-muted p-2 text-sm">
              {process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/proxy
            </code>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">Required Headers</p>
            <div className="mt-2 space-y-2">
              <div className="rounded bg-muted p-2">
                <code className="text-sm">X-Latch-Key: &lt;agent-client-key&gt;</code>
              </div>
              <div className="rounded bg-muted p-2">
                <code className="text-sm">X-Latch-Upstream: &lt;upstream-name&gt;</code>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <p className="text-sm font-medium">Example MCP Config</p>
            <pre className="mt-2 overflow-auto rounded bg-muted p-4 text-xs">
{`{
  "mcpServers": {
    "latch-proxy": {
      "url": "${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/proxy",
      "headers": {
        "X-Latch-Key": "your-agent-client-key",
        "X-Latch-Upstream": "your-upstream-name"
      }
    }
  }
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
