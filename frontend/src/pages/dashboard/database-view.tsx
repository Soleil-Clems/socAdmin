import { useState } from "react";
import { useTables } from "@/hooks/queries/use-tables";
import { useNavigationStore } from "@/stores/navigation.store";
import { useDropTable } from "@/hooks/mutations/use-drop-table";
import { useTruncateTable } from "@/hooks/mutations/use-truncate-table";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function DatabaseView() {
  const { selectedDb, setSelectedTable } = useNavigationStore();
  const { data: tables, isLoading } = useTables(selectedDb);
  const dropTable = useDropTable();
  const truncateTable = useTruncateTable();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (table: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  };

  const toggleAll = () => {
    if (!tables) return;
    if (selected.size === tables.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tables));
    }
  };

  const handleDrop = (table: string) => {
    if (!confirm(`Drop table "${table}"? This cannot be undone.`)) return;
    dropTable.mutate({ db: selectedDb, table });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(table);
      return next;
    });
  };

  const handleTruncate = (table: string) => {
    if (!confirm(`Truncate table "${table}"? All data will be deleted.`)) return;
    truncateTable.mutate({ db: selectedDb, table });
  };

  const handleBulkDrop = () => {
    if (selected.size === 0) return;
    if (!confirm(`Drop ${selected.size} table(s)? This cannot be undone.`)) return;
    for (const table of selected) {
      dropTable.mutate({ db: selectedDb, table });
    }
    setSelected(new Set());
  };

  const handleBulkTruncate = () => {
    if (selected.size === 0) return;
    if (!confirm(`Truncate ${selected.size} table(s)? All data will be deleted.`)) return;
    for (const table of selected) {
      truncateTable.mutate({ db: selectedDb, table });
    }
    setSelected(new Set());
  };

  if (!selectedDb) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a database to get started
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <h2 className="text-lg font-semibold">{selectedDb}</h2>
        <Badge variant="secondary">{tables?.length ?? 0} tables</Badge>
        {selected.size > 0 && (
          <div className="ml-auto flex gap-2">
            <Badge variant="outline">{selected.size} selected</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkTruncate}
              disabled={truncateTable.isPending}
            >
              Truncate selected
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDrop}
              disabled={dropTable.isPending}
            >
              Drop selected
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={tables?.length > 0 && selected.size === tables.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables?.map((table: string) => (
                <TableRow key={table}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(table)}
                      onCheckedChange={() => toggleSelect(table)}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => setSelectedTable(table)}
                      className="text-sm font-medium hover:underline cursor-pointer"
                    >
                      {table}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSelectedTable(table)}
                      >
                        Browse
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleTruncate(table)}
                        disabled={truncateTable.isPending}
                      >
                        Truncate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive"
                        onClick={() => handleDrop(table)}
                        disabled={dropTable.isPending}
                      >
                        Drop
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {tables?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No tables in this database
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
