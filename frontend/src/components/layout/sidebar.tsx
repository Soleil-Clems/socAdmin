import { useDatabases } from "@/hooks/queries/use-databases";
import { useTables } from "@/hooks/queries/use-tables";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
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

  const { data: databases, isLoading: dbLoading } = useDatabases();
  const { data: tables, isLoading: tablesLoading } = useTables(selectedDb);

  return (
    <aside className="w-56 bg-sidebar text-sidebar-foreground flex flex-col h-screen border-r border-sidebar-border">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-[10px] font-bold shrink-0">
            sA
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">socAdmin</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">
              {dbTypeLabels[dbType || ""] || dbType} · {user}@{host}:{port}
            </p>
          </div>
        </div>
      </div>

      {/* Databases link */}
      <div className="px-2 pt-2">
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
      <div className="px-2 pt-2 pb-1">
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
      <ScrollArea className="flex-1">
        <div className="px-2 py-1">
          {selectedDb && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-2 mb-1">
                Tables
              </p>

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

          {!selectedDb && !dbLoading && (
            <p className="text-[11px] text-sidebar-foreground/30 px-2 py-4 text-center">
              Select a database
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5">
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
          onClick={() => { resetNav(); disconnect(); }}
        >
          Disconnect
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-7 text-xs"
          onClick={() => { resetNav(); disconnect(); logout(); }}
        >
          Logout
        </Button>
      </div>
    </aside>
  );
}
