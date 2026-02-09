import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Lock, LockOpen } from "lucide-react";
import { CopyableId } from "@/components/ui/copy-button";
import { SyncToolsButton } from "@/components/dashboard/sync-tools-button";
import { ExportConfigDialog } from "@/components/dashboard/export-config-dialog";
import { UpstreamActions } from "@/components/dashboard/upstream-actions";

type UpstreamRow = {
  id: string;
  name: string;
  baseUrl: string | null;
  transport: "http" | "stdio";
  headers: Record<string, string> | null;
  authType: string;
  authValue: string | null;
  tools: unknown[] | null;
  toolsSyncError: string | null;
  toolsSyncedAt: Date | null;
  stdioCommand: string | null;
  stdioArgs: string[] | null;
  createdAt: Date;
};

export function UpstreamTable({
  upstreamList,
  cloudUrl,
  workspaceId,
}: {
  upstreamList: UpstreamRow[];
  cloudUrl: string;
  workspaceId: string;
}) {
  return (
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
  );
}
