import { useNavigationStore } from "@/stores/navigation.store";
import { databaseRequest } from "@/requests/database.request";
import { Button } from "@/components/ui/button";

export default function ExportView() {
  const { selectedDb, selectedTable } = useNavigationStore();

  const handleExport = (format: "csv" | "json" | "sql") => {
    if (!selectedDb || !selectedTable) return;
    databaseRequest.exportTable(selectedDb, selectedTable, format);
  };

  const hasTarget = selectedDb && selectedTable;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Export</span>
        {selectedDb && <span className="text-muted-foreground">{selectedDb}</span>}
        {selectedTable && <span className="text-muted-foreground">· {selectedTable}</span>}
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          {!hasTarget ? (
            <div className="text-center space-y-2">
              <p className="text-sm text-foreground font-medium">Export data</p>
              <p className="text-xs text-muted-foreground">
                Select a database and a table from the sidebar to export
              </p>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <p className="text-sm text-foreground font-medium">
                  Export <span className="text-primary">{selectedTable}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  from {selectedDb}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleExport("csv")}
                  className="border border-border rounded-lg p-4 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group"
                >
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">CSV</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Comma-separated</p>
                </button>
                <button
                  onClick={() => handleExport("json")}
                  className="border border-border rounded-lg p-4 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group"
                >
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">JSON</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Array of objects</p>
                </button>
                <button
                  onClick={() => handleExport("sql")}
                  className="border border-border rounded-lg p-4 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group"
                >
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">SQL</p>
                  <p className="text-[11px] text-muted-foreground mt-1">CREATE + INSERT</p>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
