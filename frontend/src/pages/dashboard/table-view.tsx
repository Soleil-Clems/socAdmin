import { useRows } from "@/hooks/queries/use-rows";
import { useColumns } from "@/hooks/queries/use-columns";
import { useNavigationStore } from "@/stores/navigation.store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type Column = {
  Name: string;
  Type: string;
  Null: string;
  Key: string;
};

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

export default function TableView() {
  const { selectedDb, selectedTable } = useNavigationStore();

  const { data: columns, isLoading: colLoading } = useColumns(
    selectedDb,
    selectedTable
  );
  const { data: rowsData, isLoading: rowsLoading } = useRows(
    selectedDb,
    selectedTable
  ) as { data: QueryResult | undefined; isLoading: boolean };

  if (!selectedDb) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a database to get started
      </div>
    );
  }

  if (!selectedTable) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a table to view its data
      </div>
    );
  }

  const isLoading = colLoading || rowsLoading;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <h2 className="text-lg font-semibold">{selectedTable}</h2>
        <Badge variant="secondary">{selectedDb}</Badge>
        {rowsData?.Rows && (
          <span className="text-xs text-muted-foreground">
            {rowsData.Rows.length} rows
          </span>
        )}
      </div>

      {columns && (
        <div className="px-4 py-2 border-b border-border flex gap-2 flex-wrap">
          {columns.map((col: Column) => (
            <Badge key={col.Name} variant="outline" className="text-xs">
              {col.Name}
              <span className="ml-1 text-muted-foreground">{col.Type}</span>
              {col.Key === "PRI" && (
                <span className="ml-1 text-yellow-500">PK</span>
              )}
            </Badge>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                {rowsData?.Columns?.map((col) => (
                  <TableHead key={col} className="whitespace-nowrap">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsData?.Rows?.map((row, i) => (
                <TableRow key={i}>
                  {rowsData.Columns.map((col) => (
                    <TableCell key={col} className="max-w-xs truncate text-xs">
                      {row[col] === null ? (
                        <span className="text-muted-foreground italic">NULL</span>
                      ) : (
                        String(row[col])
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </div>
  );
}
