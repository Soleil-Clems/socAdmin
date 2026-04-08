import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { databaseRequest, type MongoFindResult, type MongoCollectionStats } from "@/requests/database.request";
import { useInsertRow } from "@/hooks/mutations/use-insert-row";
import { useUpdateRow } from "@/hooks/mutations/use-update-row";
import { useDeleteRow } from "@/hooks/mutations/use-delete-row";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

// ── JSON syntax highlight ──
function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/60 italic">null</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  }

  if (typeof value === "string") {
    // ObjectId pattern
    if (/^[a-f0-9]{24}$/.test(value) && depth === 0) {
      return (
        <span>
          <span className="text-muted-foreground">ObjectId(</span>
          <span className="text-emerald-600 dark:text-emerald-400">&quot;{value}&quot;</span>
          <span className="text-muted-foreground">)</span>
        </span>
      );
    }
    // Try to parse JSON objects/arrays
    if ((value.startsWith("{") || value.startsWith("[")) && value.length < 2000) {
      try {
        const parsed = JSON.parse(value);
        return <JsonValue value={parsed} depth={depth} />;
      } catch {
        // not JSON, fall through
      }
    }
    return <span className="text-emerald-600 dark:text-emerald-400">&quot;{value}&quot;</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">{"[ ]"}</span>;
    return (
      <span>
        <span className="text-muted-foreground">{"["}</span>
        <div className="pl-4">
          {value.map((item, i) => (
            <div key={i}>
              <JsonValue value={item} depth={depth + 1} />
              {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
        <span className="text-muted-foreground">{"]"}</span>
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground">{"{ }"}</span>;
    return (
      <span>
        <span className="text-muted-foreground">{"{"}</span>
        <div className="pl-4">
          {entries.map(([k, v], i) => (
            <div key={k}>
              <span className="text-foreground/80">{k}</span>
              <span className="text-muted-foreground">{": "}</span>
              <JsonValue value={v} depth={depth + 1} />
              {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
            </div>
          ))}
        </div>
        <span className="text-muted-foreground">{"}"}</span>
      </span>
    );
  }

  return <span>{String(value)}</span>;
}

// ── Single document card ──
function DocumentCard({
  doc,
  onEdit,
  onDelete,
  onClone,
  isAdmin,
}: {
  doc: Record<string, unknown>;
  onEdit: () => void;
  onDelete: () => void;
  onClone: () => void;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const entries = Object.entries(doc);
  const preview = entries.slice(0, expanded ? entries.length : 3);
  const hasMore = !expanded && entries.length > 3;

  return (
    <div className="border border-border rounded-lg bg-card hover:border-primary/30 transition-colors group">
      {/* Document header */}
      <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2 bg-muted/30 rounded-t-lg">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-muted-foreground hover:text-foreground w-4"
        >
          {expanded ? "▾" : "▸"}
        </button>
        <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">
          {doc._id ? String(doc._id) : "—"}
        </span>
        {isAdmin && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onClone}
              className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground rounded"
            >
              Clone
            </button>
            <button
              onClick={onEdit}
              className="px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10 rounded"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10 rounded"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {/* Document body */}
      <div className="px-3 py-2 font-mono text-[12px] leading-relaxed">
        {preview.map(([key, val]) => (
          <div key={key} className="flex gap-1">
            <span className="text-foreground/80 shrink-0">{key}</span>
            <span className="text-muted-foreground shrink-0">{": "}</span>
            <span className="min-w-0">
              <JsonValue value={val} depth={key === "_id" ? 0 : 1} />
            </span>
          </div>
        ))}
        {hasMore && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[11px] text-primary hover:underline mt-1"
          >
            +{entries.length - 3} more fields...
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ──
export default function DocumentView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filterInput, setFilterInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [sortInput, setSortInput] = useState("");
  const [activeSort, setActiveSort] = useState("");

  // Collection stats
  const { data: stats } = useQuery<MongoCollectionStats>({
    queryKey: ["mongo-stats", selectedDb, selectedTable],
    queryFn: () => databaseRequest.mongoCollectionStats(selectedDb, selectedTable),
    enabled: !!selectedDb && !!selectedTable,
  });

  // Server-side find
  const { data: findResult, isLoading } = useQuery<MongoFindResult>({
    queryKey: ["mongo-find", selectedDb, selectedTable, activeFilter, activeSort, pageSize, page],
    queryFn: () =>
      databaseRequest.mongoFind(
        selectedDb,
        selectedTable,
        activeFilter || "{}",
        activeSort || "{}",
        pageSize,
        page * pageSize
      ),
    enabled: !!selectedDb && !!selectedTable,
  });

  const docs = findResult?.Rows || [];
  const totalDocs = findResult?.total ?? 0;
  const totalPages = Math.ceil(totalDocs / pageSize);

  const insertRow = useInsertRow();
  const updateRow = useUpdateRow();
  const deleteRow = useDeleteRow();

  const [showInsert, setShowInsert] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Record<string, unknown> | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState("");

  // Reset page on collection change
  const [prevTable, setPrevTable] = useState(selectedTable);
  if (selectedTable !== prevTable) {
    setPrevTable(selectedTable);
    setPage(0);
    setFilterInput("");
    setActiveFilter("");
    setSortInput("");
    setActiveSort("");
  }

  const applyFilter = useCallback(() => {
    setActiveFilter(filterInput);
    setActiveSort(sortInput);
    setPage(0);
  }, [filterInput, sortInput]);

  const clearFilter = useCallback(() => {
    setFilterInput("");
    setSortInput("");
    setActiveFilter("");
    setActiveSort("");
    setPage(0);
  }, []);

  const handleFilterKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyFilter();
    }
  };

  const invalidateFind = () => {
    queryClient.invalidateQueries({ queryKey: ["mongo-find", selectedDb, selectedTable] });
  };

  const handleInsertOpen = () => {
    setJsonInput("{\n  \n}");
    setJsonError("");
    setShowInsert(true);
  };

  const handleClone = (doc: Record<string, unknown>) => {
    const clone = { ...doc };
    delete clone._id;
    setJsonInput(JSON.stringify(clone, null, 2));
    setJsonError("");
    setShowInsert(true);
  };

  const handleEditOpen = (doc: Record<string, unknown>) => {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc)) {
      if (k === "_id") continue;
      if (typeof v === "string") {
        try {
          const parsed = JSON.parse(v);
          if (typeof parsed === "object") { clean[k] = parsed; continue; }
        } catch { /* not json */ }
      }
      clean[k] = v;
    }
    setJsonInput(JSON.stringify(clean, null, 2));
    setJsonError("");
    setEditingDoc(doc);
  };

  const handleInsertSubmit = () => {
    try {
      const data = JSON.parse(jsonInput);
      if (typeof data !== "object" || Array.isArray(data)) {
        setJsonError("Document must be a JSON object");
        return;
      }
      setJsonError("");
      insertRow.mutate(
        { db: selectedDb, table: selectedTable, data },
        { onSuccess: () => { setShowInsert(false); invalidateFind(); } }
      );
    } catch (e) {
      setJsonError(`Invalid JSON: ${(e as Error).message}`);
    }
  };

  const handleUpdateSubmit = () => {
    if (!editingDoc) return;
    try {
      const data = JSON.parse(jsonInput);
      if (typeof data !== "object" || Array.isArray(data)) {
        setJsonError("Document must be a JSON object");
        return;
      }
      setJsonError("");
      updateRow.mutate(
        {
          db: selectedDb,
          table: selectedTable,
          primaryKey: { _id: editingDoc._id },
          data,
        },
        { onSuccess: () => { setEditingDoc(null); invalidateFind(); } }
      );
    } catch (e) {
      setJsonError(`Invalid JSON: ${(e as Error).message}`);
    }
  };

  const handleDelete = (doc: Record<string, unknown>) => {
    if (!confirm("Delete this document?")) return;
    deleteRow.mutate(
      {
        db: selectedDb,
        table: selectedTable,
        primaryKey: { _id: doc._id },
      },
      { onSuccess: invalidateFind }
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">{selectedTable}</span>
        <span className="text-muted-foreground">{selectedDb}</span>
        <span className="text-muted-foreground">
          · {totalDocs.toLocaleString()} docs
          {stats && (
            <>
              {" · "}{formatBytes(stats.storage_size)}
              {" · "}{stats.index_count} idx
              {stats.avg_doc_size > 0 && <> · avg {formatBytes(stats.avg_doc_size)}</>}
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isAdmin && (
            <Button size="sm" className="h-7 text-xs px-3" onClick={handleInsertOpen}>
              + Document
            </Button>
          )}
        </div>
      </div>

      {/* Filter / Sort bar */}
      <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-medium shrink-0">Filter</span>
          <input
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={handleFilterKeyDown}
            placeholder='{"field": "value", "age": {"$gt": 25}}'
            className="flex-1 h-7 px-2 text-xs font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <span className="text-[11px] text-muted-foreground font-medium shrink-0">Sort</span>
          <input
            value={sortInput}
            onChange={(e) => setSortInput(e.target.value)}
            onKeyDown={handleFilterKeyDown}
            placeholder='{"field": 1}'
            className="w-36 h-7 px-2 text-xs font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <Button size="sm" variant="default" className="h-7 text-xs px-3" onClick={applyFilter}>
          Find
        </Button>
        {(activeFilter || activeSort) && (
          <button
            onClick={clearFilter}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1"
          >
            Reset
          </button>
        )}
      </div>

      {/* Documents */}
      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {docs.map((doc, i) => (
              <DocumentCard
                key={String(doc._id) || i}
                doc={doc}
                onEdit={() => handleEditOpen(doc)}
                onDelete={() => handleDelete(doc)}
                onClone={() => handleClone(doc)}
                isAdmin={isAdmin}
              />
            ))}
            {docs.length === 0 && (
              <div className="text-center text-muted-foreground py-16 text-sm">
                {activeFilter ? "No documents match the filter" : "Collection is empty"}
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Pagination */}
      <div className="px-3 py-1.5 border-t border-border bg-card flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Docs/page</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-6 w-16 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">
            {totalDocs > 0
              ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalDocs)} of ${totalDocs.toLocaleString()}`
              : "0 docs"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">
            Page {page + 1}{totalPages > 0 && ` / ${totalPages}`}
          </span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            Prev
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>
            Next
          </Button>
        </div>
      </div>

      {/* Insert document dialog */}
      <Dialog open={showInsert} onOpenChange={setShowInsert}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Insert document into {selectedTable}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value); setJsonError(""); }}
              placeholder='{ "key": "value" }'
              className="font-mono text-sm min-h-[200px] resize-y bg-background"
              spellCheck={false}
            />
            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
            {insertRow.isError && <p className="text-xs text-destructive">{insertRow.error.message}</p>}
            <Button className="w-full h-8" onClick={handleInsertSubmit} disabled={insertRow.isPending}>
              {insertRow.isPending ? "Inserting..." : "Insert Document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit document dialog */}
      <Dialog open={!!editingDoc} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Edit document
              {editingDoc?._id != null && (
                <span className="text-xs font-mono text-muted-foreground ml-2">
                  {String(editingDoc._id)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Edit the document fields below. The _id field cannot be changed.
            </p>
            <Textarea
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value); setJsonError(""); }}
              className="font-mono text-sm min-h-[200px] resize-y bg-background"
              spellCheck={false}
            />
            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
            {updateRow.isError && <p className="text-xs text-destructive">{updateRow.error.message}</p>}
            <Button className="w-full h-8" onClick={handleUpdateSubmit} disabled={updateRow.isPending}>
              {updateRow.isPending ? "Updating..." : "Update Document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
