import { useState, useMemo, useRef } from "react";
import { useRows } from "@/hooks/queries/use-rows";
import { useColumns } from "@/hooks/queries/use-columns";
import { useNavigationStore } from "@/stores/navigation.store";
import { useInsertRow } from "@/hooks/mutations/use-insert-row";
import { useUpdateRow } from "@/hooks/mutations/use-update-row";
import { useDeleteRow } from "@/hooks/mutations/use-delete-row";
import { useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

  // Pagination
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
  const queryClient = useQueryClient();

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // Sort
  const [sort, setSort] = useState<SortState>(null);

  const [showInsert, setShowInsert] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(
    null
  );
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

  // Filtered + sorted rows
  const displayRows = useMemo(() => {
    let rows = rowsData?.Rows || [];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((val) =>
          val !== null && String(val).toLowerCase().includes(q)
        )
      );
    }

    // Sort
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
        return null; // third click removes sort
      }
      return { column, direction: "asc" };
    });
  };

  const getSortIndicator = (column: string) => {
    if (sort?.column !== column) return "";
    return sort.direction === "asc" ? " \u2191" : " \u2193";
  };

  const hasNextPage = (rowsData?.Rows?.length ?? 0) === pageSize;
  const hasPrevPage = page > 0;

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setPage(0);
  };

  // Reset page when table changes
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

  const handleExport = (format: "csv" | "json" | "sql") => {
    databaseRequest.exportTable(selectedDb, selectedTable, format);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const content = await file.text();
      const ext = file.name.split(".").pop()?.toLowerCase();

      let result: { inserted?: number; executed?: number; errors?: string[] };

      if (ext === "sql") {
        result = await databaseRequest.importSQL(selectedDb, content);
        setImportResult(
          `${result.executed} statements executed` +
            (result.errors?.length ? `, ${result.errors.length} errors` : "")
        );
      } else if (ext === "csv") {
        result = await databaseRequest.importCSV(selectedDb, selectedTable, content);
        setImportResult(
          `${result.inserted} rows inserted` +
            (result.errors?.length ? `, ${result.errors.length} errors` : "")
        );
      } else if (ext === "json") {
        result = await databaseRequest.importJSON(selectedDb, selectedTable, content);
        setImportResult(
          `${result.inserted} rows inserted` +
            (result.errors?.length ? `, ${result.errors.length} errors` : "")
        );
      } else {
        setImportResult("Unsupported format. Use .sql, .csv, or .json");
      }

      queryClient.invalidateQueries({ queryKey: ["rows"] });
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isLoading = colLoading || rowsLoading;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-2">
        <h2 className="text-lg font-semibold">{selectedTable}</h2>
        <Badge variant="secondary">{selectedDb}</Badge>
        {rowsData?.Rows && (
          <span className="text-xs text-muted-foreground">
            {rowsData.Rows.length} rows
            {search && ` (${displayRows.length} filtered)`}
          </span>
        )}
        {importResult && (
          <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded">
            {importResult}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 w-48"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,.sql"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import"}
          </Button>
          <Select onValueChange={(v) => handleExport(v as "csv" | "json" | "sql")}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="Export" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="sql">SQL</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleInsertOpen}>
            + Add row
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Actions</TableHead>
                {rowsData?.Columns?.map((col) => (
                  <TableHead
                    key={col}
                    className="whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort(col)}
                  >
                    {col}
                    {getSortIndicator(col)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleEditOpen(row)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive"
                      onClick={() => handleDelete(row)}
                    >
                      Del
                    </Button>
                  </TableCell>
                  {rowsData?.Columns?.map((col) => (
                    <TableCell key={col} className="max-w-xs truncate text-xs">
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
              {displayRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={(rowsData?.Columns?.length ?? 0) + 1}
                    className="text-center text-muted-foreground py-8"
                  >
                    {search ? "No matching rows" : "No data"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      {/* Pagination */}
      <div className="px-4 py-2 border-t border-border flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Page {page + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrevPage}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
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
            <DialogTitle>Insert row into {selectedTable}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {insertableColumns.map((col: Column) => {
              const meta = getColumnMeta(col.Type);
              return (
                <div key={col.Name} className="space-y-1">
                  <label className="text-sm font-medium">
                    {col.Name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {col.Type}
                    </span>
                    {col.Null === "YES" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        nullable
                      </span>
                    )}
                  </label>
                  {meta.inputType === "checkbox" ? (
                    <div className="flex items-center gap-2 h-9">
                      <Checkbox
                        checked={formData[col.Name] === "true"}
                        onCheckedChange={(v) =>
                          setFormData({
                            ...formData,
                            [col.Name]: v ? "true" : "false",
                          })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
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
                    />
                  )}
                </div>
              );
            })}
            <Button
              className="w-full"
              onClick={handleInsertSubmit}
              disabled={insertRow.isPending}
            >
              {insertRow.isPending ? "Inserting..." : "Insert"}
            </Button>
            {insertRow.isError && (
              <p className="text-sm text-destructive">
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
            <DialogTitle>Edit row</DialogTitle>
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
                  <label className="text-sm font-medium">
                    {colName}
                    {colDef && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {colDef.Type}
                      </span>
                    )}
                    {isPK && (
                      <span className="ml-1 text-yellow-500 text-xs">PK</span>
                    )}
                    {isAI && (
                      <span className="ml-1 text-blue-500 text-xs">AI</span>
                    )}
                  </label>
                  {meta.kind === "boolean" ? (
                    <div className="flex items-center gap-2 h-9">
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
                      <span className="text-sm text-muted-foreground">
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
                    />
                  )}
                </div>
              );
            })}
            <Button
              className="w-full"
              onClick={handleUpdateSubmit}
              disabled={updateRow.isPending}
            >
              {updateRow.isPending ? "Updating..." : "Update"}
            </Button>
            {updateRow.isError && (
              <p className="text-sm text-destructive">
                {updateRow.error.message}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
