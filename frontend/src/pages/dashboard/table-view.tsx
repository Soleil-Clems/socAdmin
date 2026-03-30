import { useState } from "react";
import { useRows } from "@/hooks/queries/use-rows";
import { useColumns } from "@/hooks/queries/use-columns";
import { useNavigationStore } from "@/stores/navigation.store";
import { useInsertRow } from "@/hooks/mutations/use-insert-row";
import { useUpdateRow } from "@/hooks/mutations/use-update-row";
import { useDeleteRow } from "@/hooks/mutations/use-delete-row";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const insertRow = useInsertRow();
  const updateRow = useUpdateRow();
  const deleteRow = useDeleteRow();

  const [showInsert, setShowInsert] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const primaryKeys = columns?.filter((c: Column) => c.Key === "PRI").map((c: Column) => c.Name) || [];

  const getPrimaryKey = (row: Record<string, unknown>) => {
    const pk: Record<string, unknown> = {};
    // Si pas de PK explicite, utiliser toutes les colonnes comme identifiant
    const keys = primaryKeys.length > 0 ? primaryKeys : rowsData?.Columns || [];
    for (const k of keys) {
      pk[k] = row[k];
    }
    return pk;
  };

  const handleInsertOpen = () => {
    const initial: Record<string, string> = {};
    rowsData?.Columns?.forEach((col) => (initial[col] = ""));
    setFormData(initial);
    setShowInsert(true);
  };

  const handleEditOpen = (row: Record<string, unknown>) => {
    const data: Record<string, string> = {};
    rowsData?.Columns?.forEach((col) => {
      data[col] = row[col] === null ? "" : String(row[col]);
    });
    setFormData(data);
    setEditingRow(row);
  };

  const handleInsertSubmit = () => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(formData)) {
      data[k] = v === "" ? null : v;
    }
    insertRow.mutate(
      { db: selectedDb, table: selectedTable, data },
      { onSuccess: () => setShowInsert(false) }
    );
  };

  const handleUpdateSubmit = () => {
    if (!editingRow) return;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(formData)) {
      data[k] = v === "" ? null : v;
    }
    updateRow.mutate(
      { db: selectedDb, table: selectedTable, primaryKey: getPrimaryKey(editingRow), data },
      { onSuccess: () => setEditingRow(null) }
    );
  };

  const handleDelete = (row: Record<string, unknown>) => {
    if (!confirm("Delete this row?")) return;
    deleteRow.mutate({
      db: selectedDb,
      table: selectedTable,
      primaryKey: getPrimaryKey(row),
    });
  };

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
        <div className="ml-auto">
          <Button size="sm" onClick={handleInsertOpen}>
            + Add row
          </Button>
        </div>
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
                <TableHead className="w-24">Actions</TableHead>
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
                  <TableCell className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleEditOpen(row)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive"
                      onClick={() => handleDelete(row)}
                    >
                      Del
                    </Button>
                  </TableCell>
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

      {/* Insert dialog */}
      <Dialog open={showInsert} onOpenChange={setShowInsert}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insert row into {selectedTable}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rowsData?.Columns?.map((col) => (
              <div key={col} className="space-y-1">
                <label className="text-sm font-medium">{col}</label>
                <Input
                  value={formData[col] || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, [col]: e.target.value })
                  }
                  placeholder="NULL"
                />
              </div>
            ))}
            <Button
              className="w-full"
              onClick={handleInsertSubmit}
              disabled={insertRow.isPending}
            >
              {insertRow.isPending ? "Inserting..." : "Insert"}
            </Button>
            {insertRow.isError && (
              <p className="text-sm text-destructive">{insertRow.error.message}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingRow} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit row</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rowsData?.Columns?.map((col) => (
              <div key={col} className="space-y-1">
                <label className="text-sm font-medium">
                  {col}
                  {primaryKeys.includes(col) && (
                    <span className="ml-1 text-yellow-500 text-xs">PK</span>
                  )}
                </label>
                <Input
                  value={formData[col] || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, [col]: e.target.value })
                  }
                  disabled={primaryKeys.includes(col)}
                  placeholder="NULL"
                />
              </div>
            ))}
            <Button
              className="w-full"
              onClick={handleUpdateSubmit}
              disabled={updateRow.isPending}
            >
              {updateRow.isPending ? "Updating..." : "Update"}
            </Button>
            {updateRow.isError && (
              <p className="text-sm text-destructive">{updateRow.error.message}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
