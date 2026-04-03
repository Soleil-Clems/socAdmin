import { useState } from "react";
import { useRows } from "@/hooks/queries/use-rows";
import { useColumns } from "@/hooks/queries/use-columns";
import { useNavigationStore } from "@/stores/navigation.store";
import { useInsertRow } from "@/hooks/mutations/use-insert-row";
import { useUpdateRow } from "@/hooks/mutations/use-update-row";
import { useDeleteRow } from "@/hooks/mutations/use-delete-row";
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

export default function TableView() {
  const { selectedDb, selectedTable } = useNavigationStore();

  const { data: columns, isLoading: colLoading } = useColumns(
    selectedDb,
    selectedTable
  );
  const { data: rowsData, isLoading: rowsLoading } = useRows(
    selectedDb,
    selectedTable
  ) as { data: QueryResult | undefined; isLoading: boolean };

  const insertRow = useInsertRow();
  const updateRow = useUpdateRow();
  const deleteRow = useDeleteRow();

  const [showInsert, setShowInsert] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const primaryKeys = columns?.filter((c: Column) => c.Key === "PRI").map((c: Column) => c.Name) || [];

  const columnMap = new Map<string, Column>();
  columns?.forEach((c: Column) => columnMap.set(c.Name, c));

  const getPrimaryKey = (row: Record<string, unknown>) => {
    const pk: Record<string, unknown> = {};
    const keys = primaryKeys.length > 0 ? primaryKeys : rowsData?.Columns || [];
    for (const k of keys) {
      pk[k] = row[k];
    }
    return pk;
  };

  const insertableColumns =
    columns?.filter((c: Column) => !isAutoIncrement(c)) || [];

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
      { db: selectedDb, table: selectedTable, primaryKey: getPrimaryKey(editingRow), data },
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
      <div className="p-4 border-b border-border flex items-center gap-2">
        <h2 className="text-lg font-semibold">{selectedTable}</h2>
        <Badge variant="secondary">{selectedDb}</Badge>
        {rowsData?.Rows && (
          <span className="text-xs text-muted-foreground">
            {rowsData.Rows.length} rows
          </span>
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={handleInsertOpen}>
            + Add row
          </Button>
        </div>
      </div>

      {columns && (
        <div className="px-4 py-2 border-b border-border flex gap-2 flex-wrap">
          {columns.map((col: Column) => (
            <Badge key={col.Name} variant="outline" className="text-xs">
              {col.Name}
              <span className="ml-1 text-muted-foreground">{col.Type}</span>
              {col.Key === "PRI" && (
                <span className="ml-1 text-yellow-500">PK</span>
              )}
            </Badge>
          ))}
        </div>
      )}

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
                  <TableHead key={col} className="whitespace-nowrap">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsData?.Rows?.map((row, i) => (
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
                  {rowsData.Columns.map((col) => (
                    <TableCell key={col} className="max-w-xs truncate text-xs">
                      {row[col] === null ? (
                        <span className="text-muted-foreground italic">NULL</span>
                      ) : (
                        String(row[col])
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

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
                : { inputType: "text" as const, step: undefined, kind: "string" as const };
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
