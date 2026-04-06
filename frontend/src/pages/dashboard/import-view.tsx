import { useState, useRef } from "react";
import { useNavigationStore } from "@/stores/navigation.store";
import { useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export default function ImportView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImporting(true);
    setResult(null);
    setError(null);

    try {
      const content = await file.text();
      const ext = file.name.split(".").pop()?.toLowerCase();

      let res: { inserted?: number; executed?: number; errors?: string[] };

      if (ext === "sql") {
        if (!selectedDb) {
          setError("Select a database first to import SQL");
          setImporting(false);
          return;
        }
        res = await databaseRequest.importSQL(selectedDb, content);
        setResult(
          `${res.executed} SQL statements executed` +
            (res.errors?.length ? `. ${res.errors.length} error(s)` : "")
        );
      } else if (ext === "csv") {
        if (!selectedDb || !selectedTable) {
          setError("Select a database and a table to import CSV");
          setImporting(false);
          return;
        }
        res = await databaseRequest.importCSV(selectedDb, selectedTable, content);
        setResult(
          `${res.inserted} rows inserted into ${selectedTable}` +
            (res.errors?.length ? `. ${res.errors.length} error(s)` : "")
        );
      } else if (ext === "json") {
        if (!selectedDb || !selectedTable) {
          setError("Select a database and a table to import JSON");
          setImporting(false);
          return;
        }
        res = await databaseRequest.importJSON(selectedDb, selectedTable, content);
        setResult(
          `${res.inserted} rows inserted into ${selectedTable}` +
            (res.errors?.length ? `. ${res.errors.length} error(s)` : "")
        );
      } else {
        setError("Unsupported format. Use .sql, .csv, or .json");
      }

      queryClient.invalidateQueries({ queryKey: ["rows"] });
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Import</span>
        {selectedDb && <span className="text-muted-foreground">{selectedDb}</span>}
        {selectedTable && <span className="text-muted-foreground">· {selectedTable}</span>}
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-foreground font-medium">Import data from a file</p>
            <p className="text-xs text-muted-foreground">
              Supported formats: <span className="font-medium">.sql</span> (requires database),{" "}
              <span className="font-medium">.csv</span> and <span className="font-medium">.json</span> (require database + table)
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.sql"
            onChange={handleFile}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors"
          >
            {importing ? (
              <p className="text-sm text-muted-foreground">Importing {fileName}...</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Click to select a file
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  .sql, .csv, .json
                </p>
              </>
            )}
          </div>

          {result && (
            <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
              <p className="text-xs text-primary font-medium">{result}</p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <div className="text-[11px] text-muted-foreground space-y-1">
            <p><span className="font-medium">SQL:</span> Executes all statements in the selected database</p>
            <p><span className="font-medium">CSV:</span> Inserts rows into the selected table (headers must match column names)</p>
            <p><span className="font-medium">JSON:</span> Inserts rows into the selected table (array of objects)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
