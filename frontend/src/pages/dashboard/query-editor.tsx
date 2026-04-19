import { useState, useEffect, useRef, useCallback } from "react";
import { useExecuteQuery } from "@/hooks/mutations/use-execute-query";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useQueryClient } from "@tanstack/react-query";
import { useSqlAutocomplete, type Suggestion } from "@/hooks/use-sql-autocomplete";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Detect DDL statements that change the schema (tables/databases). */
function isDDL(sql: string): boolean {
  const head = sql.trimStart().toUpperCase();
  return /^(CREATE|DROP|ALTER|RENAME)\s/.test(head);
}

/** Map common MySQL-only keywords to PostgreSQL equivalents for error hints. */
const PG_HINTS: Record<string, string> = {
  AUTO_INCREMENT: "PostgreSQL uses SERIAL or GENERATED ALWAYS AS IDENTITY instead of AUTO_INCREMENT.",
  ENGINE: "PostgreSQL does not support ENGINE=. Remove it.",
  "UNSIGNED": "PostgreSQL does not support UNSIGNED. Use a CHECK constraint instead.",
  TINYINT: "PostgreSQL does not have TINYINT. Use SMALLINT.",
  DATETIME: "PostgreSQL uses TIMESTAMP instead of DATETIME.",
};

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
  const dbType = useConnectionStore((s) => s.dbType);
  const isMongo = dbType === "mongodb";
  const isPg = dbType === "postgresql";
  const [query, setQuery] = useState("");
  const executeQuery = useExecuteQuery();
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  // Autocomplete state
  const { getSuggestions } = useSqlAutocomplete(selectedDb || "", dbType || "mysql");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const result = executeQuery.data as QueryResult | undefined;

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  // Measure caret position in textarea for dropdown placement
  const measureCaretPosition = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return { top: 0, left: 0 };

    const text = ta.value.substring(0, ta.selectionEnd);
    const lines = text.split("\n");
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const paddingTop = parseFloat(getComputedStyle(ta).paddingTop) || 8;
    const paddingLeft = parseFloat(getComputedStyle(ta).paddingLeft) || 10;

    // Approximate character width using a canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const font = getComputedStyle(ta).font;
    if (ctx) ctx.font = font;
    const charWidth = ctx ? ctx.measureText("m").width : 8;

    const currentLine = lines.length - 1;
    const currentCol = lines[lines.length - 1].length;

    return {
      top: paddingTop + (currentLine + 1) * lineHeight - ta.scrollTop,
      left: paddingLeft + currentCol * charWidth,
    };
  }, []);

  const updateSuggestions = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const textBeforeCursor = ta.value.substring(0, ta.selectionEnd);
    const items = getSuggestions(textBeforeCursor);

    if (items.length > 0) {
      setSuggestions(items);
      setSelectedIdx(0);
      const pos = measureCaretPosition();
      setDropdownPos(pos);
    } else {
      setSuggestions([]);
      setDropdownPos(null);
    }
  }, [getSuggestions, measureCaretPosition]);

  const acceptSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const cursorPos = ta.selectionEnd;
      const textBefore = ta.value.substring(0, cursorPos);
      const textAfter = ta.value.substring(cursorPos);

      // Find the prefix to replace
      const prefixMatch = isMongo
        ? textBefore.match(/[\w$]+$/)
        : textBefore.match(/[\w.]*\w+$/);
      const prefixLen = prefixMatch ? prefixMatch[0].length : 0;

      // For dot notation, only replace after the dot
      let replaceFrom = cursorPos - prefixLen;
      if (prefixMatch?.[0]?.includes(".")) {
        const dotIdx = prefixMatch[0].lastIndexOf(".");
        replaceFrom = cursorPos - prefixLen + dotIdx + 1;
      }

      const newText = ta.value.substring(0, replaceFrom) + suggestion.text + textAfter;
      setQuery(newText);
      setSuggestions([]);
      setDropdownPos(null);

      // Restore focus + cursor position
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = replaceFrom + suggestion.text.length;
        ta.setSelectionRange(newPos, newPos);
      });
    },
    [isMongo],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Autocomplete navigation
    if (suggestions.length > 0 && dropdownPos) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        // Tab always accepts. Enter only accepts if dropdown is open (not Ctrl+Enter).
        if (e.key === "Tab" || (!e.metaKey && !e.ctrlKey)) {
          e.preventDefault();
          acceptSuggestion(suggestions[selectedIdx]);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestions([]);
        setDropdownPos(null);
        return;
      }
    }

    // Execute query
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      setSuggestions([]);
      setDropdownPos(null);
      handleExecute();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    // Defer suggestion computation to after state update
    requestAnimationFrame(() => updateSuggestions());
  };

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
          if (isDDL(query)) {
            queryClient.invalidateQueries({ queryKey: ["tables"] });
            queryClient.invalidateQueries({ queryKey: ["databases"] });
          }
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

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setSuggestions([]);
        setDropdownPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay to allow click on dropdown items
              setTimeout(() => {
                if (!dropdownRef.current?.contains(document.activeElement)) {
                  setSuggestions([]);
                  setDropdownPos(null);
                }
              }, 150);
            }}
            placeholder={
              isMongo
                ? `{"aggregate": "collection", "pipeline": [...], "cursor": {}}`
                : selectedDb
                  ? `SELECT * FROM ${selectedDb}...`
                  : "SELECT * FROM ..."
            }
            className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm font-mono transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 min-h-[100px] resize-y"
            spellCheck={false}
          />
          {suggestions.length > 0 && dropdownPos && (
            <div
              ref={dropdownRef}
              className="absolute z-50 min-w-[200px] max-w-[320px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
              style={{
                top: dropdownPos.top + 4,
                left: Math.min(dropdownPos.left, 300),
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.text + s.kind}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptSuggestion(s);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                    i === selectedIdx
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent/50"
                  }`}
                >
                  <span
                    className={`shrink-0 w-[18px] h-[18px] flex items-center justify-center rounded text-[9px] font-bold ${
                      s.kind === "keyword"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : s.kind === "table"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : s.kind === "column"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                    }`}
                  >
                    {s.kind === "keyword" ? "K" : s.kind === "table" ? "T" : s.kind === "column" ? "C" : "M"}
                  </span>
                  <span className="font-mono truncate">{s.text}</span>
                  {s.detail && (
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      {s.detail}
                    </span>
                  )}
                </button>
              ))}
              <div className="px-2.5 py-1 border-t border-border text-[10px] text-muted-foreground">
                Tab to accept · Esc to dismiss
              </div>
            </div>
          )}
        </div>
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
          <div className="border-b border-border bg-card flex flex-col" style={{ maxHeight: "40vh" }}>
            {history.length > 0 && (
              <div className="px-3 py-1.5 border-b border-border flex items-center justify-between shrink-0">
                <span className="text-[11px] text-muted-foreground">{history.length} queries</span>
                <button
                  className="text-[11px] text-destructive hover:underline"
                  onClick={clearHistory}
                >
                  Clear history
                </button>
              </div>
            )}
            <ScrollArea className="flex-1 min-h-0">
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
          </div>
        )}

        {/* Error */}
        {executeQuery.isError && (
          <div className="px-3 py-2 text-xs text-destructive bg-destructive/5 border-b border-destructive/20">
            <p>{executeQuery.error.message}</p>
            {isPg && (() => {
              const msg = executeQuery.error.message.toUpperCase();
              const hint = Object.entries(PG_HINTS).find(([kw]) => msg.includes(kw));
              return hint ? (
                <p className="mt-1 text-[11px] text-muted-foreground font-medium">
                  Hint: {hint[1]}
                </p>
              ) : null;
            })()}
          </div>
        )}

        {/* Results table */}
        {result && (
          <ScrollArea className="h-full">
            <div className="p-3">
              {isDDL(query) && !result.Rows?.length ? (
                <p className="text-[11px] text-green-600 dark:text-green-400 mb-2 font-medium">
                  Query executed successfully
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mb-2">
                  {result.Rows?.length ?? 0} rows returned
                </p>
              )}
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
