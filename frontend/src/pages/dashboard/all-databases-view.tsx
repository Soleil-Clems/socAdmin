import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDatabases } from "@/hooks/queries/use-databases";
import { useCreateDatabase } from "@/hooks/mutations/use-create-database";
import { useDropDatabase } from "@/hooks/mutations/use-drop-database";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { databaseRequest, type DatabaseInfo } from "@/requests/database.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const dbTypeLabels: Record<string, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
};

export default function AllDatabasesView() {
  const { data: databases, isLoading } = useDatabases();
  const { data: stats } = useQuery<DatabaseInfo[]>({
    queryKey: ["databases", "stats"],
    queryFn: databaseRequest.listWithStats,
  });
  const createDb = useCreateDatabase();
  const dropDb = useDropDatabase();
  const { setSelectedDb } = useNavigationStore();
  const dbType = useConnectionStore((s) => s.dbType);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [showCreate, setShowCreate] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [search, setSearch] = useState("");

  // Build a lookup map for stats by DB name
  const statsMap = useMemo(() => {
    const map = new Map<string, DatabaseInfo>();
    stats?.forEach((s) => map.set(s.name, s));
    return map;
  }, [stats]);

  const filtered = useMemo(() => {
    if (!databases) return [];
    if (!search.trim()) return databases;
    const q = search.toLowerCase();
    return databases.filter((db: string) => db.toLowerCase().includes(q));
  }, [databases, search]);

  const handleCreate = async () => {
    if (!newDbName.trim()) return;
    await createDb.mutateAsync(newDbName.trim());
    setShowCreate(false);
    setNewDbName("");
  };

  const handleDrop = (db: string) => {
    if (!confirm(`Drop database "${db}"? This cannot be undone.`)) return;
    dropDb.mutate(db);
  };

  const handleExportDb = (db: string) => {
    databaseRequest.exportDatabase(db);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Databases</span>
        <span className="text-muted-foreground">
          {dbTypeLabels[dbType || ""] || dbType} · {databases?.length ?? 0} databases
          {search && ` (${filtered.length} match)`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter databases..."
            className="h-7 w-44 text-xs"
          />
          {isAdmin && (
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => { setNewDbName(""); setShowCreate(true); }}
            >
              + Database
            </Button>
          )}
        </div>
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
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Database
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-20">
                  Tables
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-24">
                  Size
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((db: string) => {
                const info = statsMap.get(db);
                return (
                <tr
                  key={db}
                  className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                >
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => setSelectedDb(db)}
                      className="text-[13px] font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {db}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right text-[12px] text-muted-foreground tabular-nums">
                    {info ? info.table_count : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[12px] text-muted-foreground tabular-nums">
                    {info?.size || "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex justify-end gap-0.5">
                      <button
                        className="px-2 py-0.5 text-[11px] text-foreground hover:bg-accent rounded transition-colors"
                        onClick={() => setSelectedDb(db)}
                      >
                        Open
                      </button>
                      <button
                        className="px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground rounded transition-colors"
                        onClick={() => handleExportDb(db)}
                      >
                        Export
                      </button>
                      {isAdmin && (
                        <button
                          className="px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors"
                          onClick={() => handleDrop(db)}
                          disabled={dropDb.isPending}
                        >
                          Drop
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-12 text-sm">
                    {search ? "No matching databases" : "No databases found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* Create DB dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Create database</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              placeholder="Database name"
              className="h-9"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <Button
              className="w-full h-9"
              onClick={handleCreate}
              disabled={createDb.isPending || !newDbName.trim()}
            >
              {createDb.isPending ? "Creating..." : "Create"}
            </Button>
            {createDb.isError && (
              <p className="text-xs text-destructive">{createDb.error.message}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
