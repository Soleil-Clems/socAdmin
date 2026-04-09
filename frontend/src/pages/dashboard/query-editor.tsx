import { useState, useEffect } from "react";
import { useExecuteQuery } from "@/hooks/mutations/use-execute-query";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

type HistoryEntry = {
  query: string;
  database: string;
  timestamp: number;
  rowCount: number | null;
  error: string | null;
};

const HISTORY_KEY = "socadmin_query_history";
const MAX_HISTORY = 50;

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export default function QueryEditor() {
  const { selectedDb } = useNavigationStore();
  const isMongo = useConnectionStore((s) => s.dbType) === "mongodb";
  const [query, setQuery] = useState("");
  const executeQuery = useExecuteQuery();
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  const result = executeQuery.data as QueryResult | undefined;

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const handleExecute = () => {
    if (!query.trim()) return;
    executeQuery.mutate(
      { query: query.trim(), database: selectedDb || undefined },
      {
        onSuccess: (data) => {
          const res = data as QueryResult;
          setHistory((prev) => [
            {
              query: query.trim(),
              database: selectedDb || "",
              timestamp: Date.now(),
              rowCount: res.Rows?.length ?? 0,
              error: null,
            },
            ...prev,
          ]);
        },
        onError: (err) => {
          setHistory((prev) => [
            {
              query: query.trim(),
              database: selectedDb || "",
              timestamp: Date.now(),
              rowCount: null,
              error: err.message,
            },
            ...prev,
          ]);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleReplay = (entry: HistoryEntry) => {
    setQuery(entry.query);
    setShowHistory(false);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString();
  };

  const mongoTemplates = [
    {
      label: "find",
      query: `{"find": "${selectedDb ? "collection" : "users"}", "filter": {}, "limit": 50}`,
    },
    {
      label: "aggregate",
      query: `{"aggregate": "${selectedDb ? "collection" : "users"}", "pipeline": [\n  {"$match": {}},\n  {"$group": {"_id": "$field", "count": {"$sum": 1}}},\n  {"$sort": {"count": -1}}\n], "cursor": {}}`,
    },
    {
      label: "count",
      query: `{"count": "${selectedDb ? "collection" : "users"}", "query": {}}`,
    },
    {
      label: "distinct",
      query: `{"distinct": "${selectedDb ? "collection" : "users"}", "key": "field", "query": {}}`,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Editor area */}
      <div className="p-3 border-b border-border bg-card space-y-2">
        <div className="flex items-center gap-2 text-xs">
          {selectedDb ? (
            <span className="text-primary bg-primary/10 px-2 py-0.5 rounded font-medium">
              {selectedDb}
            </span>
          ) : (
            <span className="text-muted-foreground">No DB selected — use USE db;</span>
          )}
          {isMongo && (
            <div className="flex items-center gap-1">
              {mongoTemplates.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setQuery(t.query)}
                  className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                  title={`Insert ${t.label} template`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto">
            <button
              className={`text-xs px-2 py-1 rounded transition-colors ${
                showHistory
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setShowHistory(!showHistory)}
            >
              History ({history.length})
            </button>
          </div>
        </div>
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isMongo
              ? `{"aggregate": "collection", "pipeline": [...], "cursor": {}}`
              : selectedDb
                ? `SELECT * FROM ${selectedDb}...`
                : "SELECT * FROM ..."
          }
          className="font-mono text-sm min-h-[100px] resize-y bg-background"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to run
          </p>
          <Button
            onClick={handleExecute}
            disabled={executeQuery.isPending || !query.trim()}
            size="sm"
            className="h-7 text-xs px-4"
          >
            {executeQuery.isPending ? "Running..." : "Execute"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* History panel */}
        {showHistory && (
          <div className="border-b border-border bg-card">
            <ScrollArea className="max-h-56">
              <div className="p-2 space-y-0.5">
                {history.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No queries yet
                  </p>
                )}
                {history.map((entry, i) => (
                  <button
                    key={i}
                    className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded hover:bg-accent/50 group transition-colors"
                    onClick={() => handleReplay(entry)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate">{entry.query}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(entry.timestamp)}
                        </span>
                        {entry.database && (
                          <span className="text-[10px] text-primary/70">
                            {entry.database}
                          </span>
                        )}
                        {entry.error ? (
                          <span className="text-[10px] text-destructive">Error</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {entry.rowCount} rows
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
            {history.length > 0 && (
              <div className="px-3 py-1 border-t border-border">
                <button
                  className="text-[11px] text-destructive hover:underline"
                  onClick={clearHistory}
                >
                  Clear history
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {executeQuery.isError && (
          <div className="px-3 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20">
            {executeQuery.error.message}
          </div>
        )}

        {/* Results table */}
        {result && (
          <ScrollArea className="h-full">
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground mb-2">
                {result.Rows?.length ?? 0} rows returned
              </p>
              <table className="w-full data-table">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <tr className="border-b border-border">
                    {result.Columns?.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.Rows?.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
                      {result.Columns.map((col) => (
                        <td
                          key={col}
                          className="px-3 py-1 max-w-xs truncate text-[13px]"
                        >
                          {row[col] === null ? (
                            <span className="text-muted-foreground/50 italic text-[11px]">
                              NULL
                            </span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}

        {!result && !executeQuery.isError && !showHistory && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Write a query and hit Execute
          </div>
        )}
      </div>
    </div>
  );
}
