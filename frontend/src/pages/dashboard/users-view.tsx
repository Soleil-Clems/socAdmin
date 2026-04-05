import { useUsers } from "@/hooks/queries/use-users";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

export default function UsersView() {
  const { data, isLoading, isError, error } = useUsers();
  const result = data as QueryResult | undefined;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">User Accounts</span>
        {result?.Rows && (
          <span className="text-muted-foreground">{result.Rows.length} users</span>
        )}
      </div>

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
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
                {result?.Columns?.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.Rows?.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                >
                  {result.Columns.map((col) => (
                    <td key={col} className="px-3 py-1.5 text-[13px]">
                      {row[col] === null ? (
                        <span className="text-muted-foreground/50 italic text-[11px]">NULL</span>
                      ) : (
                        String(row[col])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {(!result?.Rows || result.Rows.length === 0) && (
                <tr>
                  <td
                    colSpan={result?.Columns?.length ?? 1}
                    className="text-center text-muted-foreground py-12 text-sm"
                  >
                    No users found
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
