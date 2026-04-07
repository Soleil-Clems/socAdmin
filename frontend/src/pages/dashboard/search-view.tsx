import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { databaseRequest, type SearchResult } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SearchView() {
  const { selectedDb, setSelectedTable } = useNavigationStore();
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const { data: results, isLoading, isFetching } = useQuery<SearchResult[]>({
    queryKey: ["search", selectedDb, activeQuery],
    queryFn: () => databaseRequest.searchGlobal(selectedDb!, activeQuery, 10),
    enabled: !!selectedDb && !!activeQuery,
  });

  const handleSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setActiveQuery(trimmed);
  };

  const totalMatches = results?.reduce((sum, r) => sum + r.total, 0) ?? 0;
  const tableCount = results?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Search</span>
        <span className="text-muted-foreground">
          {selectedDb}
          {activeQuery && results && !isLoading && (
            <> · {totalMatches} matches in {tableCount} tables</>
          )}
        </span>
      </div>

      <div className="px-3 py-3 border-b border-border flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search across all tables..."
          className="h-8 text-sm flex-1"
          autoFocus
        />
        <Button
          size="sm"
          className="h-8 text-xs px-4"
          onClick={handleSearch}
          disabled={!query.trim() || isFetching}
        >
          {isFetching ? "Searching..." : "Search"}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {!activeQuery && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            Enter a search term to find data across all tables in{" "}
            <span className="font-medium text-foreground">{selectedDb}</span>
          </div>
        )}

        {isLoading && activeQuery && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            Searching...
          </div>
        )}

        {activeQuery && results && results.length === 0 && !isLoading && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            No results found for "{activeQuery}"
          </div>
        )}

        {results && results.length > 0 && (
          <div className="p-3 space-y-4">
            {results.map((result) => (
              <div key={result.table} className="border border-border rounded overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedTable(result.table)}
                      className="text-[13px] font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {result.table}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      {result.total} match{result.total !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedTable(result.table)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Open table →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full data-table">
                    <thead>
                      <tr className="border-b border-border">
                        {result.columns.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.matches.map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-accent/30">
                          {result.columns.map((col) => (
                            <td
                              key={col}
                              className="px-3 py-1 text-[12px] text-foreground max-w-[200px] truncate"
                              title={String(row[col] ?? "")}
                            >
                              <HighlightMatch
                                text={String(row[col] ?? "")}
                                query={activeQuery}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary font-medium rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
