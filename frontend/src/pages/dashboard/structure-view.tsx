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
  Default: string | null;
  Extra: string;
};

export default function StructureView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const { data: columns, isLoading } = useColumns(selectedDb, selectedTable);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <h2 className="text-lg font-semibold">{selectedTable}</h2>
        <Badge variant="secondary">{selectedDb}</Badge>
        <span className="text-xs text-muted-foreground">Structure</span>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Nullable</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Extra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {columns?.map((col: Column) => (
                <TableRow key={col.Name}>
                  <TableCell className="font-medium">{col.Name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {col.Type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {col.Null === "YES" ? (
                      <span className="text-muted-foreground text-xs">NULL</span>
                    ) : (
                      <span className="text-xs font-medium">NOT NULL</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {col.Key === "PRI" && (
                      <Badge className="bg-yellow-500/15 text-yellow-500 text-xs">
                        PRIMARY
                      </Badge>
                    )}
                    {col.Key === "UNI" && (
                      <Badge className="bg-blue-500/15 text-blue-500 text-xs">
                        UNIQUE
                      </Badge>
                    )}
                    {col.Key === "MUL" && (
                      <Badge className="bg-purple-500/15 text-purple-500 text-xs">
                        INDEX
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {col.Default ?? <span className="italic">NULL</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {col.Extra || "-"}
                  </TableCell>
                </TableRow>
              ))}
              {(!columns || columns.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No columns found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </div>
  );
}
