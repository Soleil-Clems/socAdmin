import { useState } from "react";
import { useDatabases } from "@/hooks/queries/use-databases";
import { useTables } from "@/hooks/queries/use-tables";
import { useCreateDatabase } from "@/hooks/mutations/use-create-database";
import { useCreateTable } from "@/hooks/mutations/use-create-table";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
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

export default function Sidebar() {
  const { host, port, user, dbType, disconnect } = useConnectionStore();
  const logout = useAuthStore((s) => s.logout);
  const { selectedDb, selectedTable, setSelectedDb, setSelectedTable, reset: resetNav } =
    useNavigationStore();

  const { data: databases, isLoading: dbLoading } = useDatabases();
  const { data: tables, isLoading: tablesLoading } = useTables(selectedDb);
  const createDb = useCreateDatabase();
  const createTable = useCreateTable();

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
    <aside className="w-64 border-r border-border bg-card flex flex-col h-screen">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold">socAdmin</h1>
        <p className="text-xs text-muted-foreground truncate">
          {dbType?.toUpperCase()} — {user}@{host}:{port}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Databases
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={openCreateDb}
            >
              + New
            </Button>
          </div>

          {dbLoading && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}

          {databases?.map((db: string) => (
            <div key={db}>
              <button
                onClick={() => setSelectedDb(db)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                  selectedDb === db
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-foreground hover:bg-accent/50"
                }`}
              >
                {db}
              </button>

              {selectedDb === db && (
                <div className="ml-3 border-l border-border pl-2">
                  {tablesLoading && (
                    <div className="space-y-1 py-1">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full" />
                      ))}
                    </div>
                  )}

                  {tables?.map((table: string) => (
                    <button
                      key={table}
                      onClick={() => setSelectedTable(table)}
                      className={`w-full text-left px-2 py-1 rounded-md text-xs transition-colors ${
                        selectedTable === table
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                    >
                      {table}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-border space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => { resetNav(); disconnect(); }}
        >
          Disconnect DB
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => { resetNav(); disconnect(); logout(); }}
        >
          Logout
        </Button>
      </div>

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
              onKeyDown={(e) =>
                e.key === "Enter" && tableDefs.length === 0 && handleCreateDb()
              }
            />

            {/* Tables section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Tables (optional)</p>
                <Button variant="outline" size="sm" onClick={addTableDef}>
                  + Add table
                </Button>
              </div>

              {tableDefs.map((tbl, ti) => (
                <div
                  key={ti}
                  className="border border-border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={tbl.name}
                      onChange={(e) => updateTableName(ti, e.target.value)}
                      placeholder="Table name"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeTableDef(ti)}
                    >
                      Remove
                    </Button>
                  </div>

                  <p className="text-xs font-medium text-muted-foreground">
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
                        className="flex-1"
                      />
                      {dbType === "mongodb" ? (
                        <Input
                          value={col.type}
                          onChange={(e) =>
                            updateTableColumn(ti, ci, "type", e.target.value)
                          }
                          placeholder="Type"
                          className="flex-1"
                        />
                      ) : (
                        <Select
                          value={col.type}
                          onValueChange={(v) =>
                            v && updateTableColumn(ti, ci, "type", v)
                          }
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
                          onCheckedChange={(v) =>
                            updateTableColumn(ti, ci, "primary_key", !!v)
                          }
                        />
                        PK
                      </label>
                      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <Checkbox
                          checked={col.auto_increment}
                          onCheckedChange={(v) =>
                            updateTableColumn(ti, ci, "auto_increment", !!v)
                          }
                        />
                        AI
                      </label>
                      <label className="flex items-center gap-1 text-xs whitespace-nowrap">
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
                          className="h-8 px-2 text-destructive"
                          onClick={() => removeColumnFromDef(ti, ci)}
                        >
                          X
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addColumnToDef(ti)}
                  >
                    + Add column
                  </Button>
                </div>
              ))}
            </div>

            <Button
              className="w-full"
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
              <p className="text-sm text-destructive">
                {createDb.error.message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
