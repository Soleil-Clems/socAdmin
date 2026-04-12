import { useRef, useState } from "react";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";
import { Input } from "@/components/ui/input";

// Native dump detection — same heuristics as core/controller/database_controller.go
// looksLikeNativeDump. Kept client-side so we can warn before uploading.
function looksLikeNativeDump(content: string): boolean {
  const head = content.slice(0, 4096).toLowerCase();
  const markers = [
    "-- mysql dump",
    "-- mariadb dump",
    "-- host:",
    "-- server version",
    "-- postgresql database dump",
    "-- dumped from database",
    "-- dumped by pg_dump",
    "/*!40",
    "/*!50",
  ];
  return markers.some((m) => head.includes(m));
}

export default function ImportView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const isMongo = useConnectionStore((s) => s.dbType) === "mongodb";
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [collectionInput, setCollectionInput] = useState("");

  // For MongoDB: use selectedTable from sidebar, or the manual input
  const targetCollection = selectedTable || collectionInput.trim();

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

      if (isMongo) {
        // MongoDB: JSON and CSV only, into the target collection.
        if (!selectedDb || !targetCollection) {
          setError("Select a database and enter a collection name");
          setImporting(false);
          return;
        }
        if (ext === "json") {
          res = await databaseRequest.importJSON(selectedDb, targetCollection, content);
          setResult(
            `${res.inserted} documents inserted into ${targetCollection}` +
              (res.errors?.length ? `. ${res.errors.length} error(s)` : ""),
          );
        } else if (ext === "csv") {
          res = await databaseRequest.importCSV(selectedDb, targetCollection, content);
          setResult(
            `${res.inserted} documents inserted into ${targetCollection}` +
              (res.errors?.length ? `. ${res.errors.length} error(s)` : ""),
          );
        } else {
          setError("Unsupported format. Use .json or .csv");
        }
      } else {
        // MySQL / PostgreSQL: SQL only.
        if (ext !== "sql") {
          setError("Unsupported format. Use .sql for import.");
          setImporting(false);
          return;
        }
        if (!selectedDb) {
          setError("Select a database first");
          setImporting(false);
          return;
        }
        if (looksLikeNativeDump(content)) {
          setError(
            `"${file.name}" looks like a full database dump (mysqldump / pg_dump output). ` +
              `Use the Restore button on the database row instead — Import SQL is for hand-written scripts, not backups.`,
          );
          setImporting(false);
          return;
        }
        res = await databaseRequest.importSQL(selectedDb, content);
        setResult(`SQL script executed successfully`);
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
        <div className="w-full max-w-md space-y-5">
          <div className="text-center space-y-2">
            <p className="text-sm text-foreground font-medium">Import data from a file</p>
            <p className="text-xs text-muted-foreground">
              {isMongo
                ? "JSON and CSV import into a collection."
                : "Import a SQL script into the selected database."}
            </p>
          </div>

          {/* MongoDB: collection name input when no collection is selected in sidebar */}
          {isMongo && !selectedTable && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Target collection</label>
              <Input
                value={collectionInput}
                onChange={(e) => setCollectionInput(e.target.value)}
                placeholder="e.g. users, products, logs..."
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                The collection will be created automatically if it doesn't exist.
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={isMongo ? ".csv,.json" : ".sql"}
            onChange={handleFile}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors ${
              isMongo && !selectedTable && !collectionInput.trim() ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {importing ? (
              <p className="text-sm text-muted-foreground">Importing {fileName}...</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Click to select a file</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {isMongo ? ".json, .csv" : ".sql"}
                </p>
              </>
            )}
          </div>

          {result && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/40 rounded-md px-3 py-2">
              <p className="text-xs text-green-700 dark:text-green-400 font-medium">{result}</p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <div className="text-[11px] text-muted-foreground space-y-1">
            {isMongo ? (
              <>
                <p>
                  <span className="font-medium">JSON:</span> Inserts documents into the collection (array of objects).
                </p>
                <p>
                  <span className="font-medium">CSV:</span> Inserts documents into the collection (headers must match field names).
                </p>
              </>
            ) : (
              <>
                <p>
                  <span className="font-medium">SQL:</span> Runs a SQL script in the selected database.
                </p>
                <p className="text-muted-foreground/80">
                  To restore a full <span className="font-medium">mysqldump / pg_dump</span> backup, use the
                  <span className="font-medium"> Restore</span> button in the database list instead.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
