import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigationStore } from "@/stores/navigation.store";
import { databaseRequest } from "@/requests/database.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

const PIPELINE_TEMPLATES: { label: string; pipeline: string }[] = [
  {
    label: "$match",
    pipeline: `[
  { "$match": { "status": "active" } }
]`,
  },
  {
    label: "$group",
    pipeline: `[
  { "$group": { "_id": "$category", "count": { "$sum": 1 }, "total": { "$sum": "$amount" } } },
  { "$sort": { "count": -1 } }
]`,
  },
  {
    label: "$project",
    pipeline: `[
  { "$project": { "name": 1, "computed": { "$multiply": ["$price", "$qty"] }, "_id": 0 } }
]`,
  },
  {
    label: "$unwind",
    pipeline: `[
  { "$unwind": "$tags" },
  { "$group": { "_id": "$tags", "count": { "$sum": 1 } } },
  { "$sort": { "count": -1 } }
]`,
  },
  {
    label: "$lookup",
    pipeline: `[
  { "$lookup": { "from": "other_collection", "localField": "ref_id", "foreignField": "_id", "as": "joined" } },
  { "$limit": 10 }
]`,
  },
  {
    label: "$bucket",
    pipeline: `[
  { "$bucket": { "groupBy": "$price", "boundaries": [0, 10, 50, 100, 500], "default": "Other", "output": { "count": { "$sum": 1 } } } }
]`,
  },
  {
    label: "$facet",
    pipeline: `[
  { "$facet": {
    "byStatus": [{ "$group": { "_id": "$status", "count": { "$sum": 1 } } }],
    "total": [{ "$count": "n" }]
  }}
]`,
  },
];

export default function AggregationView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const [pipeline, setPipeline] = useState("[\n  \n]");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      databaseRequest.mongoRunAggregation(selectedDb, selectedTable, pipeline),
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const handleRun = () => {
    try {
      JSON.parse(pipeline);
    } catch {
      return;
    }
    const start = performance.now();
    mutation.mutate(undefined, {
      onSettled: () => setExecutionTime(Math.round(performance.now() - start)),
    });
  };

  if (!selectedTable) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a collection to run aggregation pipelines
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Aggregation</span>
        <span className="text-muted-foreground">
          {selectedDb}.{selectedTable}
        </span>
        {executionTime !== null && (
          <span className="text-muted-foreground/60">
            {executionTime}ms · {result?.Rows?.length ?? 0} docs
          </span>
        )}
        <div className="ml-auto">
          <Button
            size="sm"
            className="h-7 text-xs px-3"
            onClick={handleRun}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Running..." : "Run Pipeline"}
          </Button>
        </div>
      </div>

      {/* Template buttons */}
      <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground mr-1">Templates:</span>
        {PIPELINE_TEMPLATES.map((t) => (
          <button
            key={t.label}
            onClick={() => setPipeline(t.pipeline)}
            className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent/50 hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Pipeline editor */}
        <div className="w-[40%] min-w-[280px] border-r border-border flex flex-col">
          <div className="px-3 py-1 border-b border-border/50 text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
            Pipeline (JSON Array)
          </div>
          <textarea
            value={pipeline}
            onChange={(e) => setPipeline(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleRun();
              }
            }}
            className="flex-1 bg-background text-foreground font-mono text-[13px] p-3 resize-none outline-none leading-relaxed"
            spellCheck={false}
            placeholder='[\n  { "$match": { } },\n  { "$group": { "_id": "$field", "count": { "$sum": 1 } } }\n]'
          />
          {mutation.isError && (
            <div className="px-3 py-2 border-t border-destructive/30 bg-destructive/5 text-xs text-destructive">
              {mutation.error.message}
            </div>
          )}
          <div className="px-3 py-1 border-t border-border/50 text-[10px] text-muted-foreground">
            Ctrl+Enter to run
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-1 border-b border-border/50 text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
            Results {result ? `(${result.Rows?.length ?? 0} documents)` : ""}
          </div>
          {result && result.Rows && result.Rows.length > 0 ? (
            <ScrollArea className="flex-1 min-h-0">
              <table className="w-full data-table text-[12px]">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                  <tr className="border-b border-border">
                    {result.Columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.Rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
                      {result.Columns.map((col) => {
                        const val = row[col];
                        const display = val === null || val === undefined
                          ? "null"
                          : typeof val === "object"
                            ? JSON.stringify(val)
                            : String(val);
                        return (
                          <td
                            key={col}
                            className="px-3 py-1.5 font-mono max-w-[300px] truncate"
                            title={display}
                          >
                            {val === null || val === undefined ? (
                              <span className="text-muted-foreground/50 italic">null</span>
                            ) : typeof val === "object" ? (
                              <span className="text-muted-foreground">{display}</span>
                            ) : (
                              display
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          ) : result ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              No results returned
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground/50 text-sm">
              Run a pipeline to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
