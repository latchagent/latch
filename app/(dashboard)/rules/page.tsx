import { getServerSession, getUserWorkspaces } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { policyRules, policyLeases, upstreams } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck, ShieldX, ShieldAlert, Clock, Sparkles } from "lucide-react";
import { CreateRuleDialog } from "@/components/dashboard/create-rule-dialog";
import { NaturalLanguageRules } from "@/components/dashboard/natural-language-rules";
import { DeleteLeaseButton } from "@/components/dashboard/delete-lease-button";
import { RuleActions } from "@/components/dashboard/rule-actions";

export default async function RulesPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const workspacesList = await getUserWorkspaces(session.user.id);
  if (workspacesList.length === 0) redirect("/onboarding");

  const workspaceId = workspacesList[0].workspace.id;

  const [rules, leases, upstreamsList] = await Promise.all([
    db
      .select()
      .from(policyRules)
      .where(eq(policyRules.workspaceId, workspaceId))
      .orderBy(policyRules.priority),
    db
      .select()
      .from(policyLeases)
      .where(
        eq(policyLeases.workspaceId, workspaceId)
      )
      .orderBy(desc(policyLeases.createdAt)),
    db.select().from(upstreams).where(eq(upstreams.workspaceId, workspaceId)),
  ]);

  const activeLeases = leases.filter(
    (l) => new Date(l.expiresAt) > new Date()
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Policy Rules</h1>
          <p className="mt-2 text-muted-foreground">
            Configure deterministic rules for allowing, denying, or requiring approval for MCP + OpenClaw actions.
          </p>
        </div>
        <CreateRuleDialog workspaceId={workspaceId} upstreams={upstreamsList} />
      </div>

      {/* Natural Language Rule Creator */}
      <NaturalLanguageRules workspaceId={workspaceId} />

      {/* Default Policies Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Default Policies</CardTitle>
          <CardDescription>
            All actions are allowed by default. Create rules above to restrict specific actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <DefaultPolicyCard
              action="READ"
              effect="allow"
              description="Read operations"
            />
            <DefaultPolicyCard
              action="WRITE"
              effect="allow"
              description="Write operations"
            />
            <DefaultPolicyCard
              action="SEND"
              effect="allow"
              description="Messages & emails"
            />
            <DefaultPolicyCard
              action="EXECUTE"
              effect="allow"
              description="Shell/script execution"
            />
            <DefaultPolicyCard
              action="SUBMIT"
              effect="allow"
              description="Form submissions"
            />
            <DefaultPolicyCard
              action="TRANSFER"
              effect="allow"
              description="Payment/transfers"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">
            Custom Rules ({rules.length})
          </TabsTrigger>
          <TabsTrigger value="leases">
            Active Leases ({activeLeases.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Custom Policy Rules</CardTitle>
              <CardDescription>
                Rules are evaluated by specificity (tool &gt; upstream &gt; workspace). Ties are broken by newest rule.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No custom rules yet. Default policies will be used.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Effect</TableHead>
                      <TableHead>Action Class</TableHead>
                      <TableHead>Upstream</TableHead>
                      <TableHead>Tool</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead className="w-28">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {rule.smartCondition && (
                              <Badge variant="outline" className="text-xs shrink-0 border-violet-500/50 text-violet-500">
                                <Sparkles className="h-3 w-3 mr-1" />
                                AI
                              </Badge>
                            )}
                            <div className="min-w-0">
                              <span className="font-medium">{rule.name || "Unnamed rule"}</span>
                              {rule.smartCondition && (
                                <p className="text-xs text-muted-foreground truncate max-w-[300px]" title={rule.smartCondition}>
                                  {rule.smartCondition}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <EffectBadge effect={rule.effect} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {rule.smartCondition ? "—" : rule.actionClass.toUpperCase()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {rule.upstreamId ? upstreamsList.find((u) => u.id === rule.upstreamId)?.name : "All"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {rule.toolName || "All"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {rule.smartCondition 
                            ? "—" 
                            : rule.domainMatch
                              ? `${rule.domainMatchType === "suffix" ? "*." : ""}${rule.domainMatch}`
                              : "—"}
                        </TableCell>
                        <TableCell>
                          <RuleActions rule={rule} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leases">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active Leases</CardTitle>
              <CardDescription>
                Temporary allowances that bypass approval requirements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeLeases.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No active leases. Leases are created when approving actions with a duration.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action Class</TableHead>
                      <TableHead>Tool</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeLeases.map((lease) => (
                      <TableRow key={lease.id}>
                        <TableCell className="uppercase text-xs font-medium">
                          {lease.actionClass}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {lease.toolName || "*"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {lease.domainMatch || "*"}
                        </TableCell>
                        <TableCell className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {formatExpiry(lease.expiresAt)}
                        </TableCell>
                        <TableCell>
                          <DeleteLeaseButton leaseId={lease.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DefaultPolicyCard({
  action,
  effect,
  description,
}: {
  action: string;
  effect: "allow" | "deny" | "require_approval";
  description: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        {effect === "allow" && <ShieldCheck className="h-4 w-4 text-emerald-500" />}
        {effect === "deny" && <ShieldX className="h-4 w-4 text-red-500" />}
        {effect === "require_approval" && (
          <ShieldAlert className="h-4 w-4 text-amber-500" />
        )}
        <span className="text-sm font-medium">{action}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function EffectBadge({ effect }: { effect: string }) {
  switch (effect) {
    case "allow":
      return <Badge variant="success">Allow</Badge>;
    case "deny":
      return <Badge variant="destructive">Deny</Badge>;
    case "require_approval":
      return <Badge variant="warning">Require Approval</Badge>;
    default:
      return <Badge variant="secondary">{effect}</Badge>;
  }
}

function formatExpiry(date: Date): string {
  const now = new Date();
  const expiry = new Date(date);
  const diff = expiry.getTime() - now.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (minutes < 1) return "expired";
  if (minutes < 60) return `${minutes} min`;
  return `${hours}h ${minutes % 60}m`;
}
