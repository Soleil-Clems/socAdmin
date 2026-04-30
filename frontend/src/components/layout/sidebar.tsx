// @soleil-clems: Layout - sidebar
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDatabases } from "@/hooks/queries/use-databases";
import { useTables } from "@/hooks/queries/use-tables";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { databaseRequest } from "@/requests/database.request";
import ChangePasswordDialog from "@/components/change-password-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const dbTypeLabels: Record<string, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
};

function SchemaSection({
  db,
  schema,
  expanded,
  onToggle,
  selectedTable,
  onSelectTable,
}: {
  db: string;
  schema: string;
  expanded: boolean;
  onToggle: () => void;
  selectedTable: string;
  onSelectTable: (t: string) => void;
}) {
  const { data: tables, isLoading } = useQuery<string[]>({
    queryKey: ["schema-tables", db, schema],
    queryFn: () => databaseRequest.listTablesInSchema(db, schema),
    enabled: expanded,
  });

  return (
    <div className="mb-0.5">
      <button
        onClick={onToggle}
        className="w-full text-left px-2 py-1 rounded text-[11px] font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors flex items-center gap-1"
      >
        <span className="text-[9px] w-3 inline-block">{expanded ? "▼" : "▶"}</span>
        <span className="truncate">{schema}</span>
      </button>
      {expanded && (
        <div className="pl-3">
          {isLoading && (
            <div className="space-y-0.5 px-1 py-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full bg-sidebar-accent/30" />
              ))}
            </div>
          )}
          {tables?.map((table) => (
            <button
              key={table}
              onClick={() => onSelectTable(table)}
              className={`w-full text-left px-2 py-1 rounded text-[12px] transition-colors truncate ${
                selectedTable === table
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              {table}
            </button>
          ))}
          {!isLoading && tables?.length === 0 && (
            <p className="text-[11px] text-sidebar-foreground/30 px-2 py-1">empty</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { host, port, user, dbType, disconnect } = useConnectionStore();
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const role = useAuthStore((s) => s.role);
  const {
    selectedDb,
    selectedTable,
    showAllDatabases,
    setSelectedDb,
    setSelectedTable,
    setShowAllDatabases,
    reset: resetNav,
  } = useNavigationStore();

  const isPostgres = dbType === "postgresql";
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set(["public"]));
  const [showChangePassword, setShowChangePassword] = useState(false);

  const { data: databases, isLoading: dbLoading } = useDatabases();
  const { data: tables, isLoading: tablesLoading } = useTables(selectedDb);

  const { data: schemas } = useQuery<string[]>({
    queryKey: ["schemas", selectedDb],
    queryFn: () => databaseRequest.listSchemas(selectedDb),
    enabled: !!selectedDb && isPostgres,
  });

  const showSchemas = isPostgres && schemas && schemas.length > 1;
  const tablesHeaderActive = !!selectedDb && !selectedTable && !showAllDatabases;

  const toggleSchema = (s: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <aside className="w-56 bg-sidebar text-sidebar-foreground flex flex-col h-screen min-h-0 border-r border-sidebar-border overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="/logo-dark.png"
            alt="socAdmin"
            className="w-6 h-6 object-contain shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">socAdmin</p>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                dbType === "mysql" ? "bg-db-mysql" :
                dbType === "postgresql" ? "bg-db-postgresql" :
                "bg-db-mongodb"
              }`} />
              <p className="text-[10px] text-sidebar-foreground/50 truncate">
                {dbTypeLabels[dbType || ""] || dbType} · {user}@{host}:{port}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Databases link */}
      <div className="px-2 pt-2 shrink-0">
        <button
          onClick={() => setShowAllDatabases(true)}
          className={`w-full text-left px-2 py-1.5 rounded text-[13px] font-medium transition-colors ${
            showAllDatabases
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          }`}
        >
          Databases
        </button>
      </div>

      {/* DB selector dropdown */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <Select
          value={selectedDb || undefined}
          onValueChange={(db) => db && setSelectedDb(db)}
        >
          <SelectTrigger className="h-7 text-xs bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground">
            <SelectValue placeholder="Select database...">
              {selectedDb || "Select database..."}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {dbLoading && (
              <SelectItem value="__loading" disabled>Loading...</SelectItem>
            )}
            {databases?.map((db: string) => (
              <SelectItem key={db} value={db}>
                {db}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 py-1">
          {selectedDb && (
            <>
              {/* Clickable "Tables" header — returns to DB overview */}
              <button
                onClick={() => setSelectedTable("")}
                className={`w-full text-left px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-widest transition-colors mb-1 ${
                  tablesHeaderActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/40 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/70"
                }`}
              >
                Tables
              </button>

              {showSchemas ? (
                <>
                  {schemas!.map((s) => (
                    <SchemaSection
                      key={s}
                      db={selectedDb}
                      schema={s}
                      expanded={expandedSchemas.has(s)}
                      onToggle={() => toggleSchema(s)}
                      selectedTable={selectedTable}
                      onSelectTable={setSelectedTable}
                    />
                  ))}
                </>
              ) : (
                <>
                  {tablesLoading && (
                    <div className="space-y-0.5 px-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full bg-sidebar-accent/30" />
                      ))}
                    </div>
                  )}
                  {tables?.map((table: string) => (
                    <button
                      key={table}
                      onClick={() => setSelectedTable(table)}
                      className={`w-full text-left px-2 py-1 rounded text-[12px] transition-colors truncate ${
                        selectedTable === table
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      }`}
                    >
                      {table}
                    </button>
                  ))}
                  {!tablesLoading && tables?.length === 0 && (
                    <p className="text-[11px] text-sidebar-foreground/30 px-2 py-2">
                      No tables
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {!selectedDb && !dbLoading && (
            <p className="text-[11px] text-sidebar-foreground/30 px-2 py-4 text-center">
              Select a database
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5 shrink-0">
        {role && (
          <div className="px-2 py-1 flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                isAdmin ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
              {isAdmin ? "Admin" : "Read-only"}
            </span>
          </div>
        )}
        <ThemeToggle className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-7 text-xs"
          onClick={() => setShowChangePassword(true)}
        >
          Change password
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-7 text-xs"
          onClick={() => { databaseRequest.disconnect().catch(() => {}); resetNav(); disconnect(); }}
        >
          Disconnect
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-7 text-xs"
          onClick={() => { databaseRequest.disconnect().catch(() => {}); resetNav(); disconnect(); logout(); }}
        >
          Logout
        </Button>
      </div>

      <ChangePasswordDialog open={showChangePassword} onOpenChange={setShowChangePassword} />
    </aside>
  );
}
