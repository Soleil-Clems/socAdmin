import { useState } from "react";
import { useTables } from "@/hooks/queries/use-tables";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { useDropTable } from "@/hooks/mutations/use-drop-table";
import { useTruncateTable } from "@/hooks/mutations/use-truncate-table";
import { useCreateTable } from "@/hooks/mutations/use-create-table";
import type { TableColumnDef } from "@/requests/database.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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

import { typeOptionsFor } from "@/lib/column-types";

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
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { data: tables, isLoading } = useTables(selectedDb);
  const dropTable = useDropTable();
  const truncateTable = useTruncateTable();
  const createTable = useCreateTable();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<TableColumnDef[]>([emptyColumn()]);

  const typeOptions = typeOptionsFor(dbType);

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
    if (selected.size === tables!.length) {
      setSelected(new Set(tables));
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
    if (!confirm(`Truncate ${selected.size} table(s)?`)) return;
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
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a database from the sidebar
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">{selectedDb}</span>
        <span className="text-muted-foreground">{(tables?.length ?? 0)} tables</span>
        {selected.size > 0 && isAdmin && (
          <>
            <span className="text-primary font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={handleBulkTruncate}
              disabled={truncateTable.isPending}
            >
              Truncate
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[11px] px-2"
              onClick={handleBulkDrop}
              disabled={dropTable.isPending}
            >
              Drop
            </Button>
          </>
        )}
        <div className="ml-auto">
          {isAdmin && (
            <Button size="sm" className="h-7 text-xs px-3" onClick={openCreateTable}>
              + Table
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-left w-10">
                  <Checkbox
                    checked={(tables?.length ?? 0) > 0 && selected.size === (tables?.length ?? 0)}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Table
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tables?.map((table: string) => (
                <tr key={table} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
                  <td className="px-3 py-1.5">
                    <Checkbox
                      checked={selected.has(table)}
                      onCheckedChange={() => toggleSelect(table)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => setSelectedTable(table)}
                      className="text-[13px] font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {table}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex justify-end gap-0.5">
                      <button
                        className="px-2 py-0.5 text-[11px] text-foreground hover:bg-accent rounded transition-colors"
                        onClick={() => setSelectedTable(table)}
                      >
                        Browse
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            className="px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground rounded transition-colors"
                            onClick={() => handleTruncate(table)}
                            disabled={truncateTable.isPending}
                          >
                            Truncate
                          </button>
                          <button
                            className="px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors"
                            onClick={() => handleDrop(table)}
                            disabled={dropTable.isPending}
                          >
                            Drop
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tables?.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted-foreground py-12 text-sm">
                    No tables in this database
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* Create table dialog */}
      <Dialog open={showCreateTable} onOpenChange={setShowCreateTable}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Create table in {selectedDb}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Table name"
              className="h-9"
            />

            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Columns</p>
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={col.name}
                    onChange={(e) => updateColumn(i, "name", e.target.value)}
                    placeholder="Column name"
                    className="flex-1 h-8 text-sm"
                  />
                  {dbType === "mongodb" ? (
                    <Input
                      value={col.type}
                      onChange={(e) => updateColumn(i, "type", e.target.value)}
                      placeholder="Type"
                      className="flex-1 h-8 text-sm"
                    />
                  ) : (
                    <Select
                      value={col.type}
                      onValueChange={(v) => v && updateColumn(i, "type", v)}
                    >
                      <SelectTrigger className="flex-1 h-8 text-sm">
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
                  <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                    <Checkbox
                      checked={col.primary_key}
                      onCheckedChange={(v) => updateColumn(i, "primary_key", !!v)}
                    />
                    PK
                  </label>
                  <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                    <Checkbox
                      checked={col.auto_increment}
                      onCheckedChange={(v) => updateColumn(i, "auto_increment", !!v)}
                    />
                    AI
                  </label>
                  <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
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
                      className="h-7 px-2 text-destructive text-xs"
                      onClick={() => removeColumn(i)}
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setColumns([...columns, emptyColumn()])}
              >
                + Add column
              </Button>
            </div>

            <Button
              className="w-full h-9"
              onClick={handleCreateTable}
              disabled={createTable.isPending || !tableName.trim() || columns.some((c) => !c.name || !c.type)}
            >
              {createTable.isPending ? "Creating..." : "Create table"}
            </Button>
            {createTable.isError && (
              <p className="text-xs text-destructive">{createTable.error.message}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
