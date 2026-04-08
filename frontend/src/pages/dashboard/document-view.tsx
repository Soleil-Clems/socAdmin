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
import { Input } from "@/components/ui/input";
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

const OPERATORS = [
  { value: "$eq", label: "=" },
  { value: "$ne", label: "≠" },
  { value: "$gt", label: ">" },
  { value: "$gte", label: "≥" },
  { value: "$lt", label: "<" },
  { value: "$lte", label: "≤" },
  { value: "$regex", label: "contains" },
  { value: "$exists", label: "exists" },
] as const;

type FilterRow = { field: string; operator: string; value: string };
type SortRule = { field: string; direction: "1" | "-1" };
type DocField = { key: string; value: string };

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/** Convert a value string to a typed value for JSON */
function parseTypedValue(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === "null") return null;
  const num = Number(val);
  if (val !== "" && !isNaN(num)) return num;
  return val;
}

/** Build filter JSON from simple rows */
function buildFilterJSON(rows: FilterRow[]): string {
  const active = rows.filter((r) => r.field.trim());
  if (active.length === 0) return "{}";

  const filter: Record<string, unknown> = {};
  for (const r of active) {
    const val = r.value.trim();
    if (r.operator === "$eq") {
      filter[r.field] = parseTypedValue(val);
    } else if (r.operator === "$exists") {
      filter[r.field] = { $exists: val !== "false" };
    } else if (r.operator === "$regex") {
      filter[r.field] = { $regex: val, $options: "i" };
    } else {
      filter[r.field] = { [r.operator]: parseTypedValue(val) };
    }
  }
  return JSON.stringify(filter);
}

/** Build sort JSON from simple rule */
function buildSortJSON(rule: SortRule): string {
  if (!rule.field.trim()) return "{}";
  return JSON.stringify({ [rule.field]: Number(rule.direction) });
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
    if (/^[a-f0-9]{24}$/.test(value) && depth === 0) {
      return (
        <span>
          <span className="text-muted-foreground">ObjectId(</span>
          <span className="text-emerald-600 dark:text-emerald-400">&quot;{value}&quot;</span>
          <span className="text-muted-foreground">)</span>
        </span>
      );
    }
    if ((value.startsWith("{") || value.startsWith("[")) && value.length < 2000) {
      try {
        return <JsonValue value={JSON.parse(value)} depth={depth} />;
      } catch { /* not JSON */ }
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
            <button onClick={onClone} className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground rounded">Clone</button>
            <button onClick={onEdit} className="px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10 rounded">Edit</button>
            <button onClick={onDelete} className="px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10 rounded">Delete</button>
          </div>
        )}
      </div>
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
          <button onClick={() => setExpanded(true)} className="text-[11px] text-primary hover:underline mt-1">
            +{entries.length - 3} more fields...
          </button>
        )}
      </div>
    </div>
  );
}

// ── Form-based document editor for insert/edit ──
function DocFormEditor({
  fields,
  onChange,
  knownFields,
}: {
  fields: DocField[];
  onChange: (fields: DocField[]) => void;
  knownFields: string[];
}) {
  const updateField = (idx: number, patch: Partial<DocField>) => {
    const next = [...fields];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const removeField = (idx: number) => onChange(fields.filter((_, i) => i !== idx));
  const addField = () => onChange([...fields, { key: "", value: "" }]);

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="relative flex-1 max-w-[180px]">
            <Input
              value={f.key}
              onChange={(e) => updateField(i, { key: e.target.value })}
              placeholder="field name"
              className="h-8 text-xs pr-6"
              list={`fields-${i}`}
            />
            {knownFields.length > 0 && (
              <datalist id={`fields-${i}`}>
                {knownFields.filter((k) => k !== "_id").map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            )}
          </div>
          <Input
            value={f.value}
            onChange={(e) => updateField(i, { value: e.target.value })}
            placeholder="value"
            className="h-8 text-xs flex-1"
          />
          <button
            onClick={() => removeField(i)}
            className="text-muted-foreground hover:text-destructive text-sm w-6 h-8 flex items-center justify-center shrink-0"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={addField}
        className="text-[11px] text-primary hover:underline"
      >
        + Add field
      </button>
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

  // Filter mode: "simple" (form) or "json" (raw)
  const [filterMode, setFilterMode] = useState<"simple" | "json">("simple");
  const [filterRows, setFilterRows] = useState<FilterRow[]>([{ field: "", operator: "$eq", value: "" }]);
  const [sortRule, setSortRule] = useState<SortRule>({ field: "", direction: "1" });
  const [filterInput, setFilterInput] = useState("");
  const [sortInput, setSortInput] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [activeSort, setActiveSort] = useState("");

  // Insert/edit mode: "form" or "json"
  const [editMode, setEditMode] = useState<"form" | "json">("form");

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
  const columns = findResult?.Columns || [];
  const totalDocs = findResult?.total ?? 0;
  const totalPages = Math.ceil(totalDocs / pageSize);

  const insertRow = useInsertRow();
  const updateRow = useUpdateRow();
  const deleteRow = useDeleteRow();

  const [showInsert, setShowInsert] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Record<string, unknown> | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [formFields, setFormFields] = useState<DocField[]>([{ key: "", value: "" }]);

  // Reset on collection change
  const [prevTable, setPrevTable] = useState(selectedTable);
  if (selectedTable !== prevTable) {
    setPrevTable(selectedTable);
    setPage(0);
    setFilterRows([{ field: "", operator: "$eq", value: "" }]);
    setSortRule({ field: "", direction: "1" });
    setFilterInput("");
    setSortInput("");
    setActiveFilter("");
    setActiveSort("");
  }

  const applyFilter = useCallback(() => {
    if (filterMode === "simple") {
      setActiveFilter(buildFilterJSON(filterRows));
      setActiveSort(buildSortJSON(sortRule));
    } else {
      setActiveFilter(filterInput);
      setActiveSort(sortInput);
    }
    setPage(0);
  }, [filterMode, filterRows, sortRule, filterInput, sortInput]);

  const clearFilter = useCallback(() => {
    setFilterRows([{ field: "", operator: "$eq", value: "" }]);
    setSortRule({ field: "", direction: "1" });
    setFilterInput("");
    setSortInput("");
    setActiveFilter("");
    setActiveSort("");
    setPage(0);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); applyFilter(); }
  };

  const invalidateFind = () => {
    queryClient.invalidateQueries({ queryKey: ["mongo-find", selectedDb, selectedTable] });
    queryClient.invalidateQueries({ queryKey: ["mongo-stats", selectedDb, selectedTable] });
  };

  // ── Insert ──
  const handleInsertOpen = () => {
    setJsonInput("{\n  \n}");
    setFormFields([{ key: "", value: "" }]);
    setJsonError("");
    setEditMode("form");
    setShowInsert(true);
  };

  const handleClone = (doc: Record<string, unknown>) => {
    const clone = { ...doc };
    delete clone._id;
    setJsonInput(JSON.stringify(clone, null, 2));
    setFormFields(
      Object.entries(clone).map(([key, value]) => ({
        key,
        value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
      }))
    );
    setJsonError("");
    setEditMode("form");
    setShowInsert(true);
  };

  // ── Edit ──
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
    setFormFields(
      Object.entries(clean).map(([key, value]) => ({
        key,
        value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
      }))
    );
    setJsonError("");
    setEditMode("form");
    setEditingDoc(doc);
  };

  /** Build data object from form fields or JSON */
  const buildDocData = (): Record<string, unknown> | null => {
    if (editMode === "json") {
      try {
        const data = JSON.parse(jsonInput);
        if (typeof data !== "object" || Array.isArray(data)) {
          setJsonError("Must be a JSON object");
          return null;
        }
        return data;
      } catch (e) {
        setJsonError(`Invalid JSON: ${(e as Error).message}`);
        return null;
      }
    }
    // Form mode
    const data: Record<string, unknown> = {};
    for (const f of formFields) {
      const key = f.key.trim();
      if (!key) continue;
      data[key] = parseTypedValue(f.value);
    }
    if (Object.keys(data).length === 0) {
      setJsonError("Add at least one field");
      return null;
    }
    return data;
  };

  const handleInsertSubmit = () => {
    const data = buildDocData();
    if (!data) return;
    setJsonError("");
    insertRow.mutate(
      { db: selectedDb, table: selectedTable, data },
      { onSuccess: () => { setShowInsert(false); invalidateFind(); } }
    );
  };

  const handleUpdateSubmit = () => {
    if (!editingDoc) return;
    const data = buildDocData();
    if (!data) return;
    setJsonError("");
    updateRow.mutate(
      { db: selectedDb, table: selectedTable, primaryKey: { _id: editingDoc._id }, data },
      { onSuccess: () => { setEditingDoc(null); invalidateFind(); } }
    );
  };

  const handleDelete = (doc: Record<string, unknown>) => {
    if (!confirm("Delete this document?")) return;
    deleteRow.mutate(
      { db: selectedDb, table: selectedTable, primaryKey: { _id: doc._id } },
      { onSuccess: invalidateFind }
    );
  };

  // Filter row helpers
  const updateFilterRow = (idx: number, patch: Partial<FilterRow>) => {
    const next = [...filterRows];
    next[idx] = { ...next[idx], ...patch };
    setFilterRows(next);
  };
  const addFilterRow = () => setFilterRows([...filterRows, { field: "", operator: "$eq", value: "" }]);
  const removeFilterRow = (idx: number) => {
    if (filterRows.length <= 1) {
      setFilterRows([{ field: "", operator: "$eq", value: "" }]);
    } else {
      setFilterRows(filterRows.filter((_, i) => i !== idx));
    }
  };

  const hasActiveFilter = activeFilter !== "" && activeFilter !== "{}";

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

      {/* Filter bar */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 space-y-2">
        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex bg-background border border-border rounded overflow-hidden">
            <button
              onClick={() => setFilterMode("simple")}
              className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${filterMode === "simple" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Simple
            </button>
            <button
              onClick={() => setFilterMode("json")}
              className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${filterMode === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              JSON
            </button>
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="default" className="h-7 text-xs px-3" onClick={applyFilter}>
            Find
          </Button>
          {(hasActiveFilter || (activeSort && activeSort !== "{}")) && (
            <button onClick={clearFilter} className="text-[11px] text-muted-foreground hover:text-foreground px-1">
              Reset
            </button>
          )}
        </div>

        {filterMode === "simple" ? (
          <div className="space-y-1.5">
            {/* Filter rows */}
            {filterRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground w-10 shrink-0">
                  {idx === 0 ? "Where" : "and"}
                </span>
                <div className="relative">
                  <input
                    value={row.field}
                    onChange={(e) => updateFilterRow(idx, { field: e.target.value })}
                    onKeyDown={handleKeyDown}
                    placeholder="field"
                    list={`filter-fields-${idx}`}
                    className="h-7 w-32 px-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {columns.length > 0 && (
                    <datalist id={`filter-fields-${idx}`}>
                      {columns.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  )}
                </div>
                <Select
                  value={row.operator}
                  onValueChange={(v) => v && updateFilterRow(idx, { operator: v })}
                >
                  <SelectTrigger className="h-7 w-24 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {row.operator !== "$exists" && (
                  <input
                    value={row.value}
                    onChange={(e) => updateFilterRow(idx, { value: e.target.value })}
                    onKeyDown={handleKeyDown}
                    placeholder="value"
                    className="h-7 flex-1 min-w-[100px] px-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                )}
                <button
                  onClick={() => removeFilterRow(idx)}
                  className="text-muted-foreground hover:text-destructive text-sm w-5 h-7 flex items-center justify-center shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button onClick={addFilterRow} className="text-[11px] text-primary hover:underline ml-10">
                + Add condition
              </button>
              {/* Sort inline */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] text-muted-foreground shrink-0">Sort by</span>
                <div className="relative">
                  <input
                    value={sortRule.field}
                    onChange={(e) => setSortRule({ ...sortRule, field: e.target.value })}
                    onKeyDown={handleKeyDown}
                    placeholder="field"
                    list="sort-fields"
                    className="h-7 w-28 px-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {columns.length > 0 && (
                    <datalist id="sort-fields">
                      {columns.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  )}
                </div>
                <Select
                  value={sortRule.direction}
                  onValueChange={(v) => setSortRule({ ...sortRule, direction: v as "1" | "-1" })}
                >
                  <SelectTrigger className="h-7 w-20 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">ASC ↑</SelectItem>
                    <SelectItem value="-1">DESC ↓</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground font-medium shrink-0">Filter</span>
            <input
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='{"field": "value", "age": {"$gt": 25}}'
              className="flex-1 h-7 px-2 text-xs font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-[11px] text-muted-foreground font-medium shrink-0">Sort</span>
            <input
              value={sortInput}
              onChange={(e) => setSortInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='{"field": 1}'
              className="w-36 h-7 px-2 text-xs font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
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
                {hasActiveFilter ? "No documents match the filter" : "Collection is empty"}
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
            <DialogTitle className="text-base flex items-center gap-3">
              Insert document
              <div className="flex bg-muted border border-border rounded overflow-hidden ml-auto">
                <button
                  onClick={() => {
                    if (editMode === "json") {
                      // Sync JSON → form
                      try {
                        const parsed = JSON.parse(jsonInput);
                        if (typeof parsed === "object" && !Array.isArray(parsed)) {
                          setFormFields(
                            Object.entries(parsed).map(([key, value]) => ({
                              key,
                              value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
                            }))
                          );
                        }
                      } catch { /* keep current form */ }
                    }
                    setEditMode("form");
                    setJsonError("");
                  }}
                  className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${editMode === "form" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Form
                </button>
                <button
                  onClick={() => {
                    if (editMode === "form") {
                      // Sync form → JSON
                      const data: Record<string, unknown> = {};
                      for (const f of formFields) {
                        if (f.key.trim()) data[f.key.trim()] = parseTypedValue(f.value);
                      }
                      setJsonInput(JSON.stringify(data, null, 2));
                    }
                    setEditMode("json");
                    setJsonError("");
                  }}
                  className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${editMode === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  JSON
                </button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editMode === "form" ? (
              <DocFormEditor fields={formFields} onChange={setFormFields} knownFields={columns} />
            ) : (
              <Textarea
                value={jsonInput}
                onChange={(e) => { setJsonInput(e.target.value); setJsonError(""); }}
                placeholder='{ "key": "value" }'
                className="font-mono text-sm min-h-[200px] resize-y bg-background"
                spellCheck={false}
              />
            )}
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
            <DialogTitle className="text-base flex items-center gap-3">
              <span className="truncate">
                Edit document
                {editingDoc?._id != null && (
                  <span className="text-xs font-mono text-muted-foreground ml-2">
                    {String(editingDoc._id)}
                  </span>
                )}
              </span>
              <div className="flex bg-muted border border-border rounded overflow-hidden ml-auto shrink-0">
                <button
                  onClick={() => {
                    if (editMode === "json") {
                      try {
                        const parsed = JSON.parse(jsonInput);
                        if (typeof parsed === "object" && !Array.isArray(parsed)) {
                          setFormFields(
                            Object.entries(parsed).map(([key, value]) => ({
                              key,
                              value: typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
                            }))
                          );
                        }
                      } catch { /* keep form */ }
                    }
                    setEditMode("form");
                    setJsonError("");
                  }}
                  className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${editMode === "form" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Form
                </button>
                <button
                  onClick={() => {
                    if (editMode === "form") {
                      const data: Record<string, unknown> = {};
                      for (const f of formFields) {
                        if (f.key.trim()) data[f.key.trim()] = parseTypedValue(f.value);
                      }
                      setJsonInput(JSON.stringify(data, null, 2));
                    }
                    setEditMode("json");
                    setJsonError("");
                  }}
                  className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${editMode === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  JSON
                </button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editMode === "form" ? (
              <DocFormEditor fields={formFields} onChange={setFormFields} knownFields={columns} />
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Edit the document fields below. The _id field cannot be changed.
                </p>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => { setJsonInput(e.target.value); setJsonError(""); }}
                  className="font-mono text-sm min-h-[200px] resize-y bg-background"
                  spellCheck={false}
                />
              </>
            )}
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
