import { useDatabases } from "@/hooks/queries/use-databases";
import { useTables } from "@/hooks/queries/use-tables";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function Sidebar() {
  const { host, port, user, disconnect } = useConnectionStore();
  const { selectedDb, selectedTable, setSelectedDb, setSelectedTable } =
    useNavigationStore();

  const { data: databases, isLoading: dbLoading } = useDatabases();
  const { data: tables, isLoading: tablesLoading } = useTables(selectedDb);

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-screen">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold">socAdmin</h1>
        <p className="text-xs text-muted-foreground truncate">
          {user}@{host}:{port}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Databases
          </p>

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

      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={disconnect}
        >
          Disconnect
        </Button>
      </div>
    </aside>
  );
}
