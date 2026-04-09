import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerStatus } from "@/hooks/queries/use-server-status";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { databaseRequest } from "@/requests/database.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

type MongoOp = {
  opid: unknown;
  active: boolean;
  op: string;
  ns: string;
  secs_running: number;
  desc: string;
  client: string;
  command: string;
};

function formatValue(name: string, value: string): string {
  const n = Number(value);
  if (isNaN(n)) return value;

  if (name.toLowerCase() === "uptime") {
    const days = Math.floor(n / 86400);
    const hours = Math.floor((n % 86400) / 3600);
    const mins = Math.floor((n % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  if (name.toLowerCase().includes("bytes")) {
    if (n > 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
    if (n > 1048576) return `${(n / 1048576).toFixed(1)} MB`;
    if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  }

  if (n > 1000000) return n.toLocaleString();

  return value;
}

export default function StatusView() {
  const { data, isLoading, isError, error } = useServerStatus();
  const { host, port, dbType } = useConnectionStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isMongo = dbType === "mongodb";
  const queryClient = useQueryClient();
  const result = data as QueryResult | undefined;

  const [showOps, setShowOps] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const dbTypeLabel: Record<string, string> = {
    mysql: "MySQL",
    postgresql: "PostgreSQL",
    mongodb: "MongoDB",
  };

  const { data: ops, isLoading: opsLoading, refetch: refetchOps } = useQuery<MongoOp[]>({
    queryKey: ["mongo-currentop"],
    queryFn: () => databaseRequest.mongoCurrentOp(),
    enabled: isMongo && showOps,
    refetchInterval: showOps ? 5000 : false,
  });

  const killMutation = useMutation({
    mutationFn: (opid: unknown) => databaseRequest.mongoKillOp(opid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-currentop"] });
    },
  });

  const { data: logData, isLoading: logLoading, refetch: refetchLog } = useQuery({
    queryKey: ["mongo-serverlog"],
    queryFn: () => databaseRequest.mongoGetServerLog("global"),
    enabled: isMongo && showLogs,
  });

  const handleKill = (opid: unknown) => {
    if (!confirm(`Kill operation ${opid}?`)) return;
    killMutation.mutate(opid);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Server Status</span>
        <span className="text-muted-foreground">
          {dbTypeLabel[dbType || ""] || dbType} · {host}:{port}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {isMongo && (
            <Button
              size="sm"
              variant={showOps ? "secondary" : "outline"}
              className="h-6 text-[11px] px-2"
              onClick={() => setShowOps(!showOps)}
            >
              {showOps ? "Hide Operations" : "Running Operations"}
            </Button>
          )}
          {isMongo && (
            <Button
              size="sm"
              variant={showLogs ? "secondary" : "outline"}
              className="h-6 text-[11px] px-2"
              onClick={() => setShowLogs(!showLogs)}
            >
              {showLogs ? "Hide Logs" : "Server Logs"}
            </Button>
          )}
          <span className="text-[10px] text-muted-foreground">Auto-refresh 30s</span>
        </span>
      </div>

      {/* currentOp panel */}
      {isMongo && showOps && (
        <div className="border-b border-border bg-muted/30">
          <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border/50">
            <span className="text-xs font-semibold">Active Operations</span>
            <span className="text-[11px] text-muted-foreground">{ops?.length ?? 0} ops</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[10px] px-1.5 ml-auto"
              onClick={() => refetchOps()}
            >
              Refresh
            </Button>
          </div>
          {opsLoading ? (
            <div className="p-3 space-y-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : ops && ops.length > 0 ? (
            <ScrollArea className="max-h-56">
              <table className="w-full data-table text-[12px]">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">OpID</th>
                    <th className="px-2 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">Op</th>
                    <th className="px-2 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">Namespace</th>
                    <th className="px-2 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">Time</th>
                    <th className="px-2 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">Client</th>
                    <th className="px-2 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase max-w-[200px]">Command</th>
                    {isAdmin && <th className="px-2 py-1 w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {ops.map((op, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-accent/40">
                      <td className="px-2 py-1 font-mono">{String(op.opid)}</td>
                      <td className="px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          op.op === "query" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                          op.op === "insert" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                          op.op === "update" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                          op.op === "remove" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {op.op}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">{op.ns}</td>
                      <td className="px-2 py-1 font-mono">
                        {op.secs_running != null ? (
                          <span className={op.secs_running > 10 ? "text-destructive font-semibold" : ""}>
                            {op.secs_running}s
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground text-[11px]">{op.client}</td>
                      <td className="px-2 py-1 font-mono text-[11px] max-w-[200px] truncate" title={op.command}>
                        {op.command}
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-1">
                          <button
                            onClick={() => handleKill(op.opid)}
                            disabled={killMutation.isPending}
                            className="text-[10px] text-destructive hover:bg-destructive/10 px-1.5 py-0.5 rounded"
                          >
                            Kill
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              No active operations
            </div>
          )}
          {killMutation.isError && (
            <div className="px-3 py-1.5 text-[11px] text-destructive">
              {killMutation.error.message}
            </div>
          )}
        </div>
      )}

      {/* Server Logs panel */}
      {isMongo && showLogs && (
        <div className="border-b border-border bg-muted/30">
          <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border/50">
            <span className="text-xs font-semibold">Server Logs</span>
            <span className="text-[11px] text-muted-foreground">{logData?.total ?? 0} entries</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[10px] px-1.5 ml-auto"
              onClick={() => refetchLog()}
            >
              Refresh
            </Button>
          </div>
          {logLoading ? (
            <div className="p-3 space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : logData?.log && logData.log.length > 0 ? (
            <ScrollArea className="max-h-64">
              <div className="p-2 space-y-0.5 font-mono text-[10px] leading-relaxed">
                {logData.log.map((line, i) => (
                  <div key={i} className="px-1 py-0.5 hover:bg-accent/40 rounded whitespace-pre-wrap break-all text-muted-foreground">
                    {line}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              No log entries available
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Variable
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {result?.Rows?.map((row, i) => {
                const varName = String(row[result.Columns[0]] ?? "");
                const varValue = String(row[result.Columns[1]] ?? "");
                return (
                  <tr
                    key={i}
                    className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-3 py-1.5 text-[13px] font-medium">
                      {varName.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] font-mono">
                      {formatValue(varName, varValue)}
                    </td>
                  </tr>
                );
              })}
              {(!result?.Rows || result.Rows.length === 0) && (
                <tr>
                  <td colSpan={2} className="text-center text-muted-foreground py-12 text-sm">
                    No status data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}
