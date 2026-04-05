import { useNavigationStore } from "@/stores/navigation.store";
import { databaseRequest } from "@/requests/database.request";

export default function ExportView() {
  const { selectedDb, selectedTable } = useNavigationStore();

  const handleExportTable = (format: "csv" | "json" | "sql") => {
    if (!selectedDb || !selectedTable) return;
    databaseRequest.exportTable(selectedDb, selectedTable, format);
  };

  const handleExportDatabase = () => {
    if (!selectedDb) return;
    databaseRequest.exportDatabase(selectedDb);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Export</span>
        {selectedDb && <span className="text-muted-foreground">{selectedDb}</span>}
        {selectedTable && <span className="text-muted-foreground">· {selectedTable}</span>}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Export Database */}
        {selectedDb && (
          <div className="max-w-lg space-y-3">
            <div>
              <p className="text-sm font-medium">Export database</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Export all tables from <span className="text-primary font-medium">{selectedDb}</span> as a single SQL file
              </p>
            </div>
            <button
              onClick={handleExportDatabase}
              className="border border-border rounded-lg px-4 py-3 text-left hover:border-primary/40 hover:bg-accent/30 transition-colors group w-full"
            >
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                SQL — Full database
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                CREATE TABLE + INSERT for every table
              </p>
            </button>
          </div>
        )}

        {/* Export Table */}
        {selectedTable ? (
          <div className="max-w-lg space-y-3">
            <div>
              <p className="text-sm font-medium">Export table</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Export <span className="text-primary font-medium">{selectedTable}</span> from {selectedDb}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleExportTable("csv")}
                className="border border-border rounded-lg p-3 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group"
              >
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">CSV</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Comma-separated</p>
              </button>
              <button
                onClick={() => handleExportTable("json")}
                className="border border-border rounded-lg p-3 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group"
              >
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">JSON</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Array of objects</p>
              </button>
              <button
                onClick={() => handleExportTable("sql")}
                className="border border-border rounded-lg p-3 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group"
              >
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">SQL</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">CREATE + INSERT</p>
              </button>
            </div>
          </div>
        ) : selectedDb ? (
          <div className="max-w-lg">
            <p className="text-xs text-muted-foreground">
              Select a table from the sidebar to export individual tables in CSV, JSON or SQL format
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Select a database from the sidebar to export
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
