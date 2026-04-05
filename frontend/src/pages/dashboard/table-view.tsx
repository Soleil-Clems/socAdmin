import { useState, useMemo } from "react";
import { useRows } from "@/hooks/queries/use-rows";
import { useColumns } from "@/hooks/queries/use-columns";
import { useNavigationStore } from "@/stores/navigation.store";
import { useInsertRow } from "@/hooks/mutations/use-insert-row";
import { useUpdateRow } from "@/hooks/mutations/use-update-row";
import { useDeleteRow } from "@/hooks/mutations/use-delete-row";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

type Column = {
  Name: string;
  Type: string;
  Null: string;
  Key: string;
  Extra?: string;
};

type QueryResult = {
  Columns: string[];
  Rows: Record<string, unknown>[];
};

type SortState = {
  column: string;
  direction: "asc" | "desc";
} | null;

function getColumnMeta(type: string) {
  const t = type.toUpperCase();
  if (/^(TINY)?INT|^SMALL|^MEDIUM|^BIG/.test(t))
    return { inputType: "number", step: "1", kind: "integer" } as const;
  if (/^FLOAT|^DOUBLE|^REAL|^DECIMAL|^NUMERIC/.test(t))
    return { inputType: "number", step: "any", kind: "float" } as const;
  if (/^BOOL/.test(t))
    return { inputType: "checkbox", step: undefined, kind: "boolean" } as const;
  if (/^DATE$/.test(t))
    return { inputType: "date", step: undefined, kind: "date" } as const;
  if (/^DATETIME|^TIMESTAMP/.test(t))
    return { inputType: "datetime-local", step: undefined, kind: "datetime" } as const;
  if (/^TEXT|^LONGTEXT|^MEDIUMTEXT|^JSON|^JSONB/.test(t))
    return { inputType: "textarea", step: undefined, kind: "text" } as const;
  return { inputType: "text", step: undefined, kind: "string" } as const;
}

function isAutoIncrement(col: Column) {
  return (
    col.Extra?.toLowerCase().includes("auto_increment") ||
    col.Type.toUpperCase() === "SERIAL" ||
    col.Type.toUpperCase() === "BIGSERIAL"
  );
}

function castValue(raw: string, kind: string): unknown {
  if (raw === "") return null;
  switch (kind) {
    case "integer": {
      const n = parseInt(raw, 10);
      return isNaN(n) ? raw : n;
    }
    case "float": {
      const n = parseFloat(raw);
      return isNaN(n) ? raw : n;
    }
    case "boolean":
      return raw === "true" || raw === "1";
    default:
      return raw;
  }
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function TableView() {
  const { selectedDb, selectedTable } = useNavigationStore();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const { data: columns, isLoading: colLoading } = useColumns(
    selectedDb,
    selectedTable
  );
  const { data: rowsData, isLoading: rowsLoading } = useRows(
    selectedDb,
    selectedTable,
    pageSize,
    page * pageSize
  ) as { data: QueryResult | undefined; isLoading: boolean };

  const insertRow = useInsertRow();
  const updateRow = useUpdateRow();
  const deleteRow = useDeleteRow();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);

  const [showInsert, setShowInsert] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const primaryKeys =
    columns
      ?.filter((c: Column) => c.Key === "PRI")
      .map((c: Column) => c.Name) || [];

  const columnMap = new Map<string, Column>();
  columns?.forEach((c: Column) => columnMap.set(c.Name, c));

  const getPrimaryKey = (row: Record<string, unknown>) => {
    const pk: Record<string, unknown> = {};
    const keys =
      primaryKeys.length > 0 ? primaryKeys : rowsData?.Columns || [];
    for (const k of keys) {
      pk[k] = row[k];
    }
    return pk;
  };

  const insertableColumns =
    columns?.filter((c: Column) => !isAutoIncrement(c)) || [];

  const displayRows = useMemo(() => {
    let rows = rowsData?.Rows || [];

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((val) =>
          val !== null && String(val).toLowerCase().includes(q)
        )
      );
    }

    if (sort && rowsData?.Columns?.includes(sort.column)) {
      const { column, direction } = sort;
      rows = [...rows].sort((a, b) => {
        const va = a[column];
        const vb = b[column];
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;

        const na = Number(va);
        const nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb)) {
          return direction === "asc" ? na - nb : nb - na;
        }

        const sa = String(va);
        const sb = String(vb);
        return direction === "asc"
          ? sa.localeCompare(sb)
          : sb.localeCompare(sa);
      });
    }

    return rows;
  }, [rowsData, search, sort]);

  const handleSort = (column: string) => {
    setSort((prev) => {
      if (prev?.column === column) {
        if (prev.direction === "asc") return { column, direction: "desc" };
        return null;
      }
      return { column, direction: "asc" };
    });
  };

  const getSortIndicator = (column: string) => {
    if (sort?.column !== column) return " ↕";
    return sort.direction === "asc" ? " ↑" : " ↓";
  };

  const hasNextPage = (rowsData?.Rows?.length ?? 0) === pageSize;
  const hasPrevPage = page > 0;

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setPage(0);
  };

  const [prevTable, setPrevTable] = useState(selectedTable);
  if (selectedTable !== prevTable) {
    setPrevTable(selectedTable);
    setPage(0);
    setSearch("");
    setSort(null);
  }

  const handleInsertOpen = () => {
    const initial: Record<string, string> = {};
    insertableColumns.forEach((col: Column) => {
      const meta = getColumnMeta(col.Type);
      initial[col.Name] = meta.kind === "boolean" ? "false" : "";
    });
    setFormData(initial);
    setShowInsert(true);
  };

  const handleEditOpen = (row: Record<string, unknown>) => {
    const data: Record<string, string> = {};
    rowsData?.Columns?.forEach((col) => {
      const colDef = columnMap.get(col);
      const meta = colDef ? getColumnMeta(colDef.Type) : null;
      if (meta?.kind === "boolean") {
        data[col] = row[col] ? "true" : "false";
      } else {
        data[col] = row[col] === null ? "" : String(row[col]);
      }
    });
    setFormData(data);
    setEditingRow(row);
  };

  const handleInsertSubmit = () => {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(formData)) {
      const colDef = columnMap.get(k);
      const meta = colDef ? getColumnMeta(colDef.Type) : null;
      data[k] = castValue(v, meta?.kind || "string");
    }
    insertRow.mutate(
      { db: selectedDb, table: selectedTable, data },
      { onSuccess: () => setShowInsert(false) }
    );
  };

  const handleUpdateSubmit = () => {
    if (!editingRow) return;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(formData)) {
      const colDef = columnMap.get(k);
      const meta = colDef ? getColumnMeta(colDef.Type) : null;
      data[k] = castValue(v, meta?.kind || "string");
    }
    updateRow.mutate(
      {
        db: selectedDb,
        table: selectedTable,
        primaryKey: getPrimaryKey(editingRow),
        data,
      },
      { onSuccess: () => setEditingRow(null) }
    );
  };

  const handleDelete = (row: Record<string, unknown>) => {
    if (!confirm("Delete this row?")) return;
    deleteRow.mutate({
      db: selectedDb,
      table: selectedTable,
      primaryKey: getPrimaryKey(row),
    });
  };

  const isLoading = colLoading || rowsLoading;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">{selectedTable}</span>
        <span className="text-muted-foreground">
          {selectedDb}
        </span>
        {rowsData?.Rows && (
          <span className="text-muted-foreground">
            · {rowsData.Rows.length} rows
            {search && ` (${displayRows.length} match)`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter rows..."
            className="h-7 w-40 text-xs"
          />
          <Button size="sm" className="h-7 text-xs px-3" onClick={handleInsertOpen}>
            + Row
          </Button>
        </div>
      </div>

      {/* Data table — dense */}
      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-20">
                  Actions
                </th>
                {rowsData?.Columns?.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort(col)}
                  >
                    {col}
                    <span className="text-[10px] opacity-50">{getSortIndicator(col)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                >
                  <td className="px-2 py-1">
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => handleEditOpen(row)}
                        className="px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10 rounded transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(row)}
                        className="px-1.5 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                  {rowsData?.Columns?.map((col) => (
                    <td key={col} className="px-3 py-1 max-w-xs truncate text-[13px]">
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
              {displayRows.length === 0 && (
                <tr>
                  <td
                    colSpan={(rowsData?.Columns?.length ?? 0) + 1}
                    className="text-center text-muted-foreground py-12 text-sm"
                  >
                    {search ? "No matching rows" : "No data"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* Pagination bar */}
      <div className="px-3 py-1.5 border-t border-border bg-card flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows/page</span>
          <Select
            value={String(pageSize)}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-6 w-16 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">
            Page {page + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrevPage}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Insert dialog */}
      <Dialog open={showInsert} onOpenChange={setShowInsert}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Insert into {selectedTable}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {insertableColumns.map((col: Column) => {
              const meta = getColumnMeta(col.Type);
              return (
                <div key={col.Name} className="space-y-1">
                  <label className="text-xs font-medium flex items-baseline gap-2">
                    {col.Name}
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {col.Type}
                      {col.Null === "YES" && " · nullable"}
                    </span>
                  </label>
                  {meta.inputType === "checkbox" ? (
                    <div className="flex items-center gap-2 h-8">
                      <Checkbox
                        checked={formData[col.Name] === "true"}
                        onCheckedChange={(v) =>
                          setFormData({
                            ...formData,
                            [col.Name]: v ? "true" : "false",
                          })
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {formData[col.Name] === "true" ? "TRUE" : "FALSE"}
                      </span>
                    </div>
                  ) : meta.inputType === "textarea" ? (
                    <Textarea
                      value={formData[col.Name] || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [col.Name]: e.target.value,
                        })
                      }
                      placeholder="NULL"
                      rows={3}
                      className="text-sm"
                    />
                  ) : (
                    <Input
                      type={meta.inputType}
                      step={meta.step}
                      value={formData[col.Name] || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [col.Name]: e.target.value,
                        })
                      }
                      placeholder="NULL"
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              );
            })}
            <Button
              className="w-full h-8"
              onClick={handleInsertSubmit}
              disabled={insertRow.isPending}
            >
              {insertRow.isPending ? "Inserting..." : "Insert"}
            </Button>
            {insertRow.isError && (
              <p className="text-xs text-destructive">
                {insertRow.error.message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editingRow}
        onOpenChange={(open) => !open && setEditingRow(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Edit row</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rowsData?.Columns?.map((colName) => {
              const colDef = columnMap.get(colName);
              const meta = colDef
                ? getColumnMeta(colDef.Type)
                : ({
                    inputType: "text" as const,
                    step: undefined,
                    kind: "string" as const,
                  } as const);
              const isPK = primaryKeys.includes(colName);
              const isAI = colDef ? isAutoIncrement(colDef) : false;

              return (
                <div key={colName} className="space-y-1">
                  <label className="text-xs font-medium flex items-baseline gap-2">
                    {colName}
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {colDef?.Type}
                      {isPK && " · PK"}
                      {isAI && " · AI"}
                    </span>
                  </label>
                  {meta.kind === "boolean" ? (
                    <div className="flex items-center gap-2 h-8">
                      <Checkbox
                        checked={formData[colName] === "true"}
                        onCheckedChange={(v) =>
                          setFormData({
                            ...formData,
                            [colName]: v ? "true" : "false",
                          })
                        }
                        disabled={isPK}
                      />
                      <span className="text-xs text-muted-foreground">
                        {formData[colName] === "true" ? "TRUE" : "FALSE"}
                      </span>
                    </div>
                  ) : meta.inputType === "textarea" ? (
                    <Textarea
                      value={formData[colName] || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [colName]: e.target.value,
                        })
                      }
                      disabled={isPK}
                      placeholder="NULL"
                      rows={3}
                      className="text-sm"
                    />
                  ) : (
                    <Input
                      type={meta.inputType}
                      step={meta.step}
                      value={formData[colName] || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [colName]: e.target.value,
                        })
                      }
                      disabled={isPK}
                      placeholder="NULL"
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              );
            })}
            <Button
              className="w-full h-8"
              onClick={handleUpdateSubmit}
              disabled={updateRow.isPending}
            >
              {updateRow.isPending ? "Updating..." : "Update"}
            </Button>
            {updateRow.isError && (
              <p className="text-xs text-destructive">
                {updateRow.error.message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
