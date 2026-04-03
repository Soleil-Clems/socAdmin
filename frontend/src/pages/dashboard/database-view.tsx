import { useState } from "react";
import { useTables } from "@/hooks/queries/use-tables";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useDropTable } from "@/hooks/mutations/use-drop-table";
import { useTruncateTable } from "@/hooks/mutations/use-truncate-table";
import { useCreateTable } from "@/hooks/mutations/use-create-table";
import type { TableColumnDef } from "@/requests/database.request";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MYSQL_TYPES = [
  "INT", "BIGINT", "SMALLINT", "TINYINT",
  "VARCHAR(255)", "VARCHAR(100)", "VARCHAR(50)",
  "TEXT", "LONGTEXT", "MEDIUMTEXT",
  "BOOLEAN",
  "DATE", "DATETIME", "TIMESTAMP",
  "FLOAT", "DOUBLE", "DECIMAL(10,2)",
  "JSON", "BLOB",
];

const PG_TYPES = [
  "INTEGER", "BIGINT", "SMALLINT",
  "VARCHAR(255)", "VARCHAR(100)", "VARCHAR(50)",
  "TEXT",
  "BOOLEAN",
  "DATE", "TIMESTAMP", "TIMESTAMPTZ",
  "REAL", "DOUBLE PRECISION", "NUMERIC(10,2)",
  "JSON", "JSONB", "BYTEA", "UUID",
];

const emptyColumn = (): TableColumnDef => ({
  name: "",
  type: "",
  nullable: true,
  primary_key: false,
  auto_increment: false,
  default_value: "",
});

export default function DatabaseView() {
  const { selectedDb, setSelectedTable } = useNavigationStore();
  const dbType = useConnectionStore((s) => s.dbType);
  const { data: tables, isLoading } = useTables(selectedDb);
  const dropTable = useDropTable();
  const truncateTable = useTruncateTable();
  const createTable = useCreateTable();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<TableColumnDef[]>([emptyColumn()]);

  const typeOptions = dbType === "postgresql" ? PG_TYPES : MYSQL_TYPES;

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

  const updateColumn = (index: number, field: keyof TableColumnDef, value: unknown) => {
    setColumns((prev) =>
      prev.map((col, i) => (i === index ? { ...col, [field]: value } : col))
    );
  };

  const removeColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateTable = () => {
    if (!tableName.trim() || columns.some((c) => !c.name || !c.type)) return;
    createTable.mutate(
      { db: selectedDb, name: tableName.trim(), columns },
      {
        onSuccess: () => {
          setShowCreateTable(false);
          setTableName("");
          setColumns([emptyColumn()]);
        },
      }
    );
  };

  const openCreateTable = () => {
    setTableName("");
    setColumns([emptyColumn()]);
    setShowCreateTable(true);
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
          <>
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
          </>
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={openCreateTable}>
            + New table
          </Button>
        </div>
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

      {/* Create table dialog */}
      <Dialog open={showCreateTable} onOpenChange={setShowCreateTable}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create table in {selectedDb}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Table name"
            />

            <div className="space-y-2">
              <p className="text-sm font-medium">Columns</p>
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={col.name}
                    onChange={(e) => updateColumn(i, "name", e.target.value)}
                    placeholder="Column name"
                    className="flex-1"
                  />
                  {dbType === "mongodb" ? (
                    <Input
                      value={col.type}
                      onChange={(e) => updateColumn(i, "type", e.target.value)}
                      placeholder="Type"
                      className="flex-1"
                    />
                  ) : (
                    <Select
                      value={col.type}
                      onValueChange={(v) => v && updateColumn(i, "type", v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <Checkbox
                      checked={col.primary_key}
                      onCheckedChange={(v) => updateColumn(i, "primary_key", !!v)}
                    />
                    PK
                  </label>
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <Checkbox
                      checked={col.auto_increment}
                      onCheckedChange={(v) => updateColumn(i, "auto_increment", !!v)}
                    />
                    AI
                  </label>
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <Checkbox
                      checked={col.nullable}
                      onCheckedChange={(v) => updateColumn(i, "nullable", !!v)}
                    />
                    Null
                  </label>
                  {columns.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-destructive"
                      onClick={() => removeColumn(i)}
                    >
                      X
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColumns([...columns, emptyColumn()])}
              >
                + Add column
              </Button>
            </div>

            <Button
              className="w-full"
              onClick={handleCreateTable}
              disabled={createTable.isPending || !tableName.trim() || columns.some((c) => !c.name || !c.type)}
            >
              {createTable.isPending ? "Creating..." : "Create table"}
            </Button>
            {createTable.isError && (
              <p className="text-sm text-destructive">{createTable.error.message}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
