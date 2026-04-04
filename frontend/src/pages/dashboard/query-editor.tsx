import { useState, useEffect } from "react";
import { useExecuteQuery } from "@/hooks/mutations/use-execute-query";
import { useNavigationStore } from "@/stores/navigation.store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          {selectedDb && (
            <Badge variant="secondary" className="text-xs">
              {selectedDb}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {selectedDb
              ? "Queries run in this database context"
              : "No database selected \u2014 use USE db;"}
          </span>
          <div className="ml-auto">
            <Button
              variant={showHistory ? "secondary" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowHistory(!showHistory)}
            >
              History ({history.length})
            </Button>
          </div>
        </div>
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedDb
              ? `SELECT * FROM ${selectedDb}...`
              : "SELECT * FROM ..."
          }
          className="font-mono text-sm min-h-[120px] resize-y"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Ctrl+Enter to execute</p>
          <Button
            onClick={handleExecute}
            disabled={executeQuery.isPending || !query.trim()}
            size="sm"
          >
            {executeQuery.isPending ? "Running..." : "Execute"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* History panel */}
        {showHistory && (
          <div className="border-b border-border">
            <ScrollArea className="max-h-64">
              <div className="p-2 space-y-1">
                {history.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No queries yet
                  </p>
                )}
                {history.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 group cursor-pointer"
                    onClick={() => handleReplay(entry)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate">{entry.query}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(entry.timestamp)}
                        </span>
                        {entry.database && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1"
                          >
                            {entry.database}
                          </Badge>
                        )}
                        {entry.error ? (
                          <span className="text-[10px] text-destructive">
                            Error
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {entry.rowCount} rows
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplay(entry);
                      }}
                    >
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {history.length > 0 && (
              <div className="px-4 py-1 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-destructive"
                  onClick={clearHistory}
                >
                  Clear history
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {executeQuery.isError && (
          <div className="p-4 text-sm text-destructive">
            {executeQuery.error.message}
          </div>
        )}

        {result && (
          <ScrollArea className="h-full">
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-2">
                {result.Rows?.length ?? 0} rows returned
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.Columns?.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.Rows?.map((row, i) => (
                    <TableRow key={i}>
                      {result.Columns.map((col) => (
                        <TableCell
                          key={col}
                          className="max-w-xs truncate text-xs"
                        >
                          {row[col] === null ? (
                            <span className="text-muted-foreground italic">
                              NULL
                            </span>
                          ) : (
                            String(row[col])
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
