import { useState } from "react";
import { useExecuteQuery } from "@/hooks/mutations/use-execute-query";
import { useNavigationStore } from "@/stores/navigation.store";
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

export default function QueryEditor() {
  const { selectedDb } = useNavigationStore();
  const [query, setQuery] = useState(
    selectedDb ? `USE ${selectedDb};\n` : ""
  );
  const executeQuery = useExecuteQuery();

  const result = executeQuery.data as QueryResult | undefined;

  const handleExecute = () => {
    if (!query.trim()) return;
    executeQuery.mutate(query.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="SELECT * FROM ..."
          className="font-mono text-sm min-h-[120px] resize-y"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Ctrl+Enter to execute
          </p>
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

        {!result && !executeQuery.isError && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Write a query and hit Execute
          </div>
        )}
      </div>
    </div>
  );
}
