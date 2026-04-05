import { useServerStatus } from "@/hooks/queries/use-server-status";
import { useConnectionStore } from "@/stores/connection.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

function formatValue(name: string, value: string): string {
  const n = Number(value);
  if (isNaN(n)) return value;

  // Format uptime as duration
  if (name.toLowerCase() === "uptime") {
    const days = Math.floor(n / 86400);
    const hours = Math.floor((n % 86400) / 3600);
    const mins = Math.floor((n % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  // Format bytes
  if (name.toLowerCase().includes("bytes")) {
    if (n > 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
    if (n > 1048576) return `${(n / 1048576).toFixed(1)} MB`;
    if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  }

  // Format large numbers
  if (n > 1000000) return n.toLocaleString();

  return value;
}

export default function StatusView() {
  const { data, isLoading, isError, error } = useServerStatus();
  const { host, port, dbType } = useConnectionStore();
  const result = data as QueryResult | undefined;

  const dbTypeLabel: Record<string, string> = {
    mysql: "MySQL",
    postgresql: "PostgreSQL",
    mongodb: "MongoDB",
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Server Status</span>
        <span className="text-muted-foreground">
          {dbTypeLabel[dbType || ""] || dbType} · {host}:{port}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">Auto-refresh 30s</span>
      </div>

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
