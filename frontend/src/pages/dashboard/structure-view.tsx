import { useColumns } from "@/hooks/queries/use-columns";
import { useNavigationStore } from "@/stores/navigation.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type Column = {
  Name: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};

export default function StructureView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const { data: columns, isLoading } = useColumns(selectedDb, selectedTable);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">{selectedTable}</span>
        <span className="text-muted-foreground">{selectedDb} · Structure</span>
      </div>

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Column</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nullable</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Key</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Default</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Extra</th>
              </tr>
            </thead>
            <tbody>
              {columns?.map((col: Column, i: number) => (
                <tr key={col.Name} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
                  <td className="px-3 py-1.5 text-[12px] text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 text-[13px] font-medium">{col.Name}</td>
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-[12px] text-primary bg-primary/8 px-1.5 py-0.5 rounded">
                      {col.Type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[12px]">
                    {col.Null === "YES" ? (
                      <span className="text-muted-foreground">Yes</span>
                    ) : (
                      <span className="font-medium">No</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {col.Key === "PRI" && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        PRIMARY
                      </span>
                    )}
                    {col.Key === "UNI" && (
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        UNIQUE
                      </span>
                    )}
                    {col.Key === "MUL" && (
                      <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                        INDEX
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                    {col.Default ?? <span className="italic opacity-50">NULL</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                    {col.Extra || "—"}
                  </td>
                </tr>
              ))}
              {(!columns || columns.length === 0) && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-muted-foreground py-12 text-sm"
                  >
                    No columns found
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
