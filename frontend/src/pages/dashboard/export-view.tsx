import { useState } from "react";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { databaseRequest } from "@/requests/database.request";
import { useToast } from "@/components/ui/toast";

type Format = "csv" | "json" | "sql" | "yaml";

const sqlFormats: { value: Format; label: string; desc: string }[] = [
  { value: "sql", label: "SQL", desc: "CREATE + INSERT" },
  { value: "json", label: "JSON", desc: "Structured data" },
  { value: "csv", label: "CSV", desc: "Comma-separated" },
  { value: "yaml", label: "YAML", desc: "Human-readable" },
];

const mongoFormats: { value: Format; label: string; desc: string }[] = [
  { value: "json", label: "JSON", desc: "Documents array" },
  { value: "csv", label: "CSV", desc: "Flattened fields" },
];

export default function ExportView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const isMongo = useConnectionStore((s) => s.dbType) === "mongodb";
  const formats = isMongo ? mongoFormats : sqlFormats;
  const { toast } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportTable = async (format: Format) => {
    if (!selectedDb || !selectedTable) return;
    setExporting(`table-${format}`);
    try {
      await databaseRequest.exportTable(selectedDb, selectedTable, format);
      toast(`${selectedTable}.${format} exported`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(null);
    }
  };

  const handleExportDatabase = async (format: Format) => {
    if (!selectedDb) return;
    setExporting(`db-${format}`);
    try {
      await databaseRequest.exportDatabase(selectedDb, format);
      toast(`${selectedDb}.${format} exported`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Export</span>
        {selectedDb && <span className="text-muted-foreground">{selectedDb}</span>}
        {selectedTable && <span className="text-muted-foreground">· {selectedTable}</span>}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {!selectedDb ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Select a database from the sidebar to export
            </p>
          </div>
        ) : (
          <>
            {/* Export Database */}
            <div className="max-w-2xl space-y-3">
              <div>
                <p className="text-sm font-medium">Export database</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Export all {isMongo ? "collections" : "tables"} from <span className="text-primary font-medium">{selectedDb}</span>
                </p>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {formats.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => handleExportDatabase(f.value)}
                    disabled={!!exporting}
                    className="border border-border rounded-lg p-3 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {exporting === `db-${f.value}` ? "Exporting..." : f.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Export Table/Collection */}
            {selectedTable ? (
              <div className="max-w-2xl space-y-3">
                <div>
                  <p className="text-sm font-medium">Export {isMongo ? "collection" : "table"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Export <span className="text-primary font-medium">{selectedTable}</span> from {selectedDb}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {formats.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => handleExportTable(f.value)}
                      disabled={!!exporting}
                      className="border border-border rounded-lg p-3 text-center hover:border-primary/40 hover:bg-accent/30 transition-colors group disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {exporting === `table-${f.value}` ? "Exporting..." : f.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{f.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl">
                <p className="text-xs text-muted-foreground">
                  Select a {isMongo ? "collection" : "table"} to export individually
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
