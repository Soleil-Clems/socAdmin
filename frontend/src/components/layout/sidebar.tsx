import { useState } from "react";
import { useDatabases } from "@/hooks/queries/use-databases";
import { useTables } from "@/hooks/queries/use-tables";
import { useCreateDatabase } from "@/hooks/mutations/use-create-database";
import { useCreateTable } from "@/hooks/mutations/use-create-table";
import { useDropDatabase } from "@/hooks/mutations/use-drop-database";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { ThemeToggle } from "@/components/theme-toggle";
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
import type { TableColumnDef } from "@/requests/database.request";

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

type TableDef = {
  name: string;
  columns: TableColumnDef[];
};

const dbTypeLabels: Record<string, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
};

export default function Sidebar() {
  const { host, port, user, dbType, disconnect } = useConnectionStore();
  const logout = useAuthStore((s) => s.logout);
  const { selectedDb, selectedTable, setSelectedDb, setSelectedTable, reset: resetNav } =
    useNavigationStore();

  const { data: databases, isLoading: dbLoading } = useDatabases();
  const { data: tables, isLoading: tablesLoading } = useTables(selectedDb);
  const createDb = useCreateDatabase();
  const createTable = useCreateTable();
  const dropDb = useDropDatabase();

  const [showCreateDb, setShowCreateDb] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [tableDefs, setTableDefs] = useState<TableDef[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const typeOptions = dbType === "postgresql" ? PG_TYPES : MYSQL_TYPES;

  const addTableDef = () => {
    setTableDefs([...tableDefs, { name: "", columns: [emptyColumn()] }]);
  };

  const removeTableDef = (index: number) => {
    setTableDefs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTableName = (index: number, name: string) => {
    setTableDefs((prev) =>
      prev.map((t, i) => (i === index ? { ...t, name } : t))
    );
  };

  const updateTableColumn = (
    tableIndex: number,
    colIndex: number,
    field: keyof TableColumnDef,
    value: unknown
  ) => {
    setTableDefs((prev) =>
      prev.map((t, i) =>
        i === tableIndex
          ? {
              ...t,
              columns: t.columns.map((col, ci) =>
                ci === colIndex ? { ...col, [field]: value } : col
              ),
            }
          : t
      )
    );
  };

  const addColumnToDef = (tableIndex: number) => {
    setTableDefs((prev) =>
      prev.map((t, i) =>
        i === tableIndex
          ? { ...t, columns: [...t.columns, emptyColumn()] }
          : t
      )
    );
  };

  const removeColumnFromDef = (tableIndex: number, colIndex: number) => {
    setTableDefs((prev) =>
      prev.map((t, i) =>
        i === tableIndex
          ? { ...t, columns: t.columns.filter((_, ci) => ci !== colIndex) }
          : t
      )
    );
  };

  const handleCreateDb = async () => {
    if (!newDbName.trim()) return;
    setIsCreating(true);
    try {
      await createDb.mutateAsync(newDbName.trim());
      for (const tbl of tableDefs) {
        if (tbl.name.trim() && tbl.columns.some((c) => c.name && c.type)) {
          await createTable.mutateAsync({
            db: newDbName.trim(),
            name: tbl.name.trim(),
            columns: tbl.columns.filter((c) => c.name && c.type),
          });
        }
      }
      setShowCreateDb(false);
      setNewDbName("");
      setTableDefs([]);
      setSelectedDb(newDbName.trim());
    } finally {
      setIsCreating(false);
    }
  };

  const openCreateDb = () => {
    setNewDbName("");
    setTableDefs([]);
    setShowCreateDb(true);
  };

  return (
    <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col h-screen border-r border-sidebar-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-xs font-bold shrink-0">
            sA
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">socAdmin</p>
            <p className="text-[11px] text-sidebar-foreground/50 truncate">
              {dbTypeLabels[dbType || ""] || dbType} · {user}@{host}:{port}
            </p>
          </div>
        </div>
      </div>

      {/* Database list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="flex items-center justify-between px-2 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Databases
            </p>
            <button
              onClick={openCreateDb}
              className="text-[10px] font-medium text-sidebar-primary hover:text-sidebar-primary/80 transition-colors"
            >
              + New
            </button>
          </div>

          {dbLoading && (
            <div className="space-y-1 p-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full bg-sidebar-accent/50" />
              ))}
            </div>
          )}

          {databases?.map((db: string) => (
            <div key={db}>
              <div className="flex items-center group">
                <button
                  onClick={() => setSelectedDb(db)}
                  className={`flex-1 text-left px-2 py-1 rounded text-[13px] transition-colors truncate ${
                    selectedDb === db
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <span className="inline-block w-4 text-center mr-1.5 text-sidebar-foreground/30">
                    {selectedDb === db ? "▾" : "▸"}
                  </span>
                  {db}
                </button>
                <button
                  className="w-5 h-5 flex items-center justify-center text-[10px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rounded hover:bg-destructive/10"
                  onClick={() => {
                    if (!confirm(`Drop database "${db}"? This cannot be undone.`)) return;
                    dropDb.mutate(db, {
                      onSuccess: () => {
                        if (selectedDb === db) resetNav();
                      },
                    });
                  }}
                >
                  ×
                </button>
              </div>

              {selectedDb === db && (
                <div className="ml-4 border-l border-sidebar-border pl-2 mt-0.5 mb-1">
                  {tablesLoading && (
                    <div className="space-y-0.5 py-0.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full bg-sidebar-accent/30" />
                      ))}
                    </div>
                  )}

                  {tables?.map((table: string) => (
                    <button
                      key={table}
                      onClick={() => setSelectedTable(table)}
                      className={`w-full text-left px-2 py-0.5 rounded text-[12px] transition-colors truncate ${
                        selectedTable === table
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                          : "text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80"
                      }`}
                    >
                      {table}
                    </button>
                  ))}

                  {tables?.length === 0 && (
                    <p className="text-[11px] text-sidebar-foreground/30 px-2 py-1">
                      No tables
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
        <ThemeToggle className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-8 text-xs"
          onClick={() => { resetNav(); disconnect(); }}
        >
          Disconnect
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-8 text-xs"
          onClick={() => { resetNav(); disconnect(); logout(); }}
        >
          Logout
        </Button>
      </div>

      {/* Create DB dialog */}
      <Dialog open={showCreateDb} onOpenChange={setShowCreateDb}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create database</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              placeholder="Database name"
              className="h-9"
              onKeyDown={(e) =>
                e.key === "Enter" && tableDefs.length === 0 && handleCreateDb()
              }
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Tables (optional)</p>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addTableDef}>
                  + Add table
                </Button>
              </div>

              {tableDefs.map((tbl, ti) => (
                <div
                  key={ti}
                  className="border border-border rounded-md p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={tbl.name}
                      onChange={(e) => updateTableName(ti, e.target.value)}
                      placeholder="Table name"
                      className="flex-1 h-8 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-8 px-2 text-xs"
                      onClick={() => removeTableDef(ti)}
                    >
                      Remove
                    </Button>
                  </div>

                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Columns
                  </p>
                  {tbl.columns.map((col, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <Input
                        value={col.name}
                        onChange={(e) =>
                          updateTableColumn(ti, ci, "name", e.target.value)
                        }
                        placeholder="Column name"
                        className="flex-1 h-8 text-sm"
                      />
                      {dbType === "mongodb" ? (
                        <Input
                          value={col.type}
                          onChange={(e) =>
                            updateTableColumn(ti, ci, "type", e.target.value)
                          }
                          placeholder="Type"
                          className="flex-1 h-8 text-sm"
                        />
                      ) : (
                        <Select
                          value={col.type}
                          onValueChange={(v) =>
                            v && updateTableColumn(ti, ci, "type", v)
                          }
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
                          onCheckedChange={(v) =>
                            updateTableColumn(ti, ci, "primary_key", !!v)
                          }
                        />
                        PK
                      </label>
                      <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                        <Checkbox
                          checked={col.auto_increment}
                          onCheckedChange={(v) =>
                            updateTableColumn(ti, ci, "auto_increment", !!v)
                          }
                        />
                        AI
                      </label>
                      <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                        <Checkbox
                          checked={col.nullable}
                          onCheckedChange={(v) =>
                            updateTableColumn(ti, ci, "nullable", !!v)
                          }
                        />
                        Null
                      </label>
                      {tbl.columns.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive text-xs"
                          onClick={() => removeColumnFromDef(ti, ci)}
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
                    onClick={() => addColumnToDef(ti)}
                  >
                    + Add column
                  </Button>
                </div>
              ))}
            </div>

            <Button
              className="w-full h-9"
              onClick={handleCreateDb}
              disabled={isCreating || !newDbName.trim()}
            >
              {isCreating
                ? "Creating..."
                : tableDefs.length > 0
                  ? "Create database with tables"
                  : "Create database"}
            </Button>
            {createDb.isError && (
              <p className="text-xs text-destructive">
                {createDb.error.message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
