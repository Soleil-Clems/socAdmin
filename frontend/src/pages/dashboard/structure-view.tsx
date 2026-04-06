import { useState } from "react";
import { useColumns } from "@/hooks/queries/use-columns";
import { useAlterColumn } from "@/hooks/mutations/use-alter-column";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { typeOptionsFor } from "@/lib/column-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Column = {
  Name: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
};

type EditState = {
  mode: "add" | "edit";
  originalName: string; // empty in add mode
  name: string;
  type: string;
  nullable: boolean;
  default_value: string;
};

const emptyEdit = (mode: "add" | "edit"): EditState => ({
  mode,
  originalName: "",
  name: "",
  type: "",
  nullable: true,
  default_value: "",
});

export default function StructureView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const dbType = useConnectionStore((s) => s.dbType);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { data: columns, isLoading } = useColumns(selectedDb, selectedTable);
  const alter = useAlterColumn();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [error, setError] = useState("");

  const typeOptions = typeOptionsFor(dbType);
  const mongoUnsupported = dbType === "mongodb";

  const openAdd = () => {
    setError("");
    setEdit(emptyEdit("add"));
  };

  const openEdit = (col: Column) => {
    setError("");
    setEdit({
      mode: "edit",
      originalName: col.Name,
      name: col.Name,
      type: col.Type.toUpperCase(),
      nullable: col.Null === "YES",
      default_value: col.Default ?? "",
    });
  };

  const handleDrop = (name: string) => {
    if (!selectedDb || !selectedTable) return;
    if (!confirm(`Drop column "${name}"? This cannot be undone.`)) return;
    setError("");
    alter.mutate(
      { db: selectedDb, table: selectedTable, op: { op: "drop", name } },
      { onError: (e) => setError((e as Error).message) }
    );
  };

  const handleSubmit = async () => {
    if (!edit || !selectedDb || !selectedTable) return;
    if (!edit.name.trim()) {
      setError("Column name is required");
      return;
    }
    if (!edit.type.trim()) {
      setError("Column type is required");
      return;
    }
    setError("");

    try {
      if (edit.mode === "add") {
        await alter.mutateAsync({
          db: selectedDb,
          table: selectedTable,
          op: {
            op: "add",
            name: edit.name.trim(),
            type: edit.type,
            nullable: edit.nullable,
            default_value: edit.default_value,
          },
        });
      } else {
        // Edit mode: rename if name changed, then modify if anything else changed.
        const renamed = edit.name.trim() !== edit.originalName;
        if (renamed) {
          await alter.mutateAsync({
            db: selectedDb,
            table: selectedTable,
            op: {
              op: "rename",
              name: edit.originalName,
              new_name: edit.name.trim(),
            },
          });
        }
        await alter.mutateAsync({
          db: selectedDb,
          table: selectedTable,
          op: {
            op: "modify",
            name: edit.name.trim(),
            type: edit.type,
            nullable: edit.nullable,
            default_value: edit.default_value,
          },
        });
      }
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">{selectedTable}</span>
        <span className="text-muted-foreground">{selectedDb} · Structure</span>
        <div className="ml-auto">
          {isAdmin && !mongoUnsupported && (
            <Button size="sm" className="h-7 text-xs px-3" onClick={openAdd}>
              + Column
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-3 px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Column</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Nullable</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Key</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Default</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Extra</th>
                {isAdmin && !mongoUnsupported && (
                  <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-24">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {columns?.map((col: Column, i: number) => (
                <tr key={col.Name} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
                  <td className="px-3 py-1.5 text-[12px] text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5 text-[13px] font-medium">{col.Name}</td>
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-[12px] text-primary bg-primary/8 px-1.5 py-0.5 rounded">
                      {col.Type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[12px]">
                    {col.Null === "YES" ? (
                      <span className="text-muted-foreground">Yes</span>
                    ) : (
                      <span className="font-medium">No</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {col.Key === "PRI" && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        PRIMARY
                      </span>
                    )}
                    {col.Key === "UNI" && (
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        UNIQUE
                      </span>
                    )}
                    {col.Key === "MUL" && (
                      <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                        INDEX
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                    {col.Default ?? <span className="italic opacity-50">NULL</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                    {col.Extra || "—"}
                  </td>
                  {isAdmin && !mongoUnsupported && (
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-0.5">
                        <button
                          onClick={() => openEdit(col)}
                          className="px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDrop(col.Name)}
                          disabled={alter.isPending || col.Key === "PRI"}
                          className="px-1.5 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          title={col.Key === "PRI" ? "Cannot drop primary key column" : undefined}
                        >
                          Drop
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(!columns || columns.length === 0) && (
                <tr>
                  <td
                    colSpan={isAdmin && !mongoUnsupported ? 8 : 7}
                    className="text-center text-muted-foreground py-12 text-sm"
                  >
                    No columns found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* Add/Edit column dialog */}
      <Dialog open={edit !== null} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {edit?.mode === "add" ? "Add column" : `Edit column "${edit?.originalName}"`}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Name</label>
                <Input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  placeholder="column_name"
                  className="h-9"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Type</label>
                <Select
                  value={edit.type}
                  onValueChange={(v) => setEdit({ ...edit, type: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Default</label>
                <Input
                  value={edit.default_value}
                  onChange={(e) => setEdit({ ...edit, default_value: e.target.value })}
                  placeholder="e.g. '', 0, CURRENT_TIMESTAMP"
                  className="h-9"
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={edit.nullable}
                  onCheckedChange={(c) => setEdit({ ...edit, nullable: !!c })}
                />
                Nullable
              </label>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {error}
                </p>
              )}

              <Button
                className="w-full h-9"
                onClick={handleSubmit}
                disabled={alter.isPending}
              >
                {alter.isPending
                  ? "Saving..."
                  : edit.mode === "add"
                  ? "Add column"
                  : "Save changes"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
