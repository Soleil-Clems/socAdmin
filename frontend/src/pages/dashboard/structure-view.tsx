import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColumns } from "@/hooks/queries/use-columns";
import { useAlterColumn } from "@/hooks/mutations/use-alter-column";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { databaseRequest } from "@/requests/database.request";
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

  const queryClient = useQueryClient();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [error, setError] = useState("");

  // Compact
  const compactMutation = useMutation({
    mutationFn: () => databaseRequest.mongoCompactCollection(selectedDb, selectedTable),
  });

  // Duplicate
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateInput, setDuplicateInput] = useState("");
  const duplicateMutation = useMutation({
    mutationFn: (target: string) => databaseRequest.mongoDuplicateCollection(selectedDb, selectedTable, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", selectedDb] });
      setShowDuplicate(false);
    },
  });

  // Convert to Capped
  const [showConvertCapped, setShowConvertCapped] = useState(false);
  const [convertSize, setConvertSize] = useState("10485760");
  const convertCappedMutation = useMutation({
    mutationFn: () => databaseRequest.mongoConvertToCapped(selectedDb, selectedTable, parseInt(convertSize, 10)),
    onSuccess: () => setShowConvertCapped(false),
  });

  // Rename collection
  const [showRename, setShowRename] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const renameMutation = useMutation({
    mutationFn: (newName: string) => databaseRequest.mongoRenameCollection(selectedDb, selectedTable, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", selectedDb] });
      setShowRename(false);
    },
  });

  // Field type analysis
  const [showFieldAnalysis, setShowFieldAnalysis] = useState(false);
  const { data: fieldAnalysis, isLoading: fieldAnalysisLoading } = useQuery<Record<string, Record<string, number>>>({
    queryKey: ["mongo-field-analysis", selectedDb, selectedTable],
    queryFn: () => databaseRequest.mongoFieldTypeAnalysis(selectedDb, selectedTable),
    enabled: dbType === "mongodb" && !!selectedDb && !!selectedTable && showFieldAnalysis,
  });

  // Schema validation
  const typeOptions = typeOptionsFor(dbType);
  const isMongo = dbType === "mongodb";

  const { data: validation } = useQuery({
    queryKey: ["mongo-validation", selectedDb, selectedTable],
    queryFn: () => databaseRequest.mongoGetValidation(selectedDb, selectedTable),
    enabled: isMongo && !!selectedDb && !!selectedTable,
  });

  const [showValidation, setShowValidation] = useState(false);
  const [validatorInput, setValidatorInput] = useState("");
  const [validationLevel, setValidationLevel] = useState("strict");
  const [validationAction, setValidationAction] = useState("error");

  const validationMutation = useMutation({
    mutationFn: () => databaseRequest.mongoSetValidation(selectedDb, selectedTable, validatorInput, validationLevel, validationAction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-validation", selectedDb, selectedTable] });
      setShowValidation(false);
    },
  });

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
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">{selectedTable}</span>
        <span className="text-muted-foreground">{selectedDb} · Structure</span>
        {isMongo && (
          <span className="text-[11px] text-muted-foreground/70 italic">Inferred from document sample</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {isAdmin && isMongo && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={() => {
                  setDuplicateInput(selectedTable + "_copy");
                  setShowDuplicate(true);
                }}
              >
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={() => {
                  if (!confirm(`Compact "${selectedTable}"? This reclaims disk space but may take a moment.`)) return;
                  compactMutation.mutate();
                }}
                disabled={compactMutation.isPending}
              >
                {compactMutation.isPending ? "Compacting..." : "Compact"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={() => setShowConvertCapped(true)}
              >
                To Capped
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={() => {
                  setRenameInput(selectedTable);
                  setShowRename(true);
                }}
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={() => {
                  setValidatorInput(validation?.validator || "{}");
                  setValidationLevel(validation?.validationLevel || "strict");
                  setValidationAction(validation?.validationAction || "error");
                  setShowValidation(true);
                }}
              >
                Validation
              </Button>
              <Button
                size="sm"
                variant={showFieldAnalysis ? "secondary" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setShowFieldAnalysis(!showFieldAnalysis)}
              >
                {showFieldAnalysis ? "Hide Types" : "Field Types"}
              </Button>
            </>
          )}
          {isAdmin && !isMongo && (
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
      {compactMutation.isSuccess && (
        <div className="mx-3 mt-2 px-3 py-2 text-xs text-green-700 dark:text-green-400 bg-green-500/10 border border-green-500/30 rounded">
          Collection compacted successfully
        </div>
      )}
      {compactMutation.isError && (
        <div className="mx-3 mt-2 px-3 py-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded">
          {compactMutation.error.message}
        </div>
      )}

      {/* Field Type Analysis panel */}
      {isMongo && showFieldAnalysis && (
        <div className="border-b border-border bg-muted/30">
          <div className="px-3 py-1.5 border-b border-border/50">
            <span className="text-xs font-semibold">Field Type Analysis</span>
            <span className="text-[11px] text-muted-foreground ml-2">Sampled from 100 documents</span>
          </div>
          {fieldAnalysisLoading ? (
            <div className="p-3 space-y-1">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : fieldAnalysis && Object.keys(fieldAnalysis).length > 0 ? (
            <ScrollArea className="max-h-64">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                  <tr className="border-b border-border">
                    <th className="px-3 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">Field</th>
                    <th className="px-3 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">Types</th>
                    <th className="px-3 py-1 text-left text-[10px] font-semibold text-muted-foreground uppercase">Consistency</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fieldAnalysis).sort(([a], [b]) => a.localeCompare(b)).map(([field, types]) => {
                    const total = Object.values(types).reduce((a, b) => a + b, 0);
                    const entries = Object.entries(types).sort(([, a], [, b]) => b - a);
                    const isMixed = entries.length > 1;
                    return (
                      <tr key={field} className="border-b border-border/50 hover:bg-accent/40">
                        <td className="px-3 py-1.5 font-mono font-medium">{field}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {entries.map(([type, count]) => (
                              <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                type === "string" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                                type === "int" || type === "double" || type === "long" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                                type === "bool" ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                                type === "object" || type === "array" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                                type === "objectId" ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" :
                                type === "date" ? "bg-pink-500/10 text-pink-600 dark:text-pink-400" :
                                "bg-muted text-muted-foreground"
                              }`}>
                                {type} ({count})
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          {isMixed ? (
                            <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                              MIXED
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {total}/{total}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              No field data available
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
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
                {isAdmin && !isMongo && (
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
                  {isAdmin && !isMongo && (
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
                    colSpan={isAdmin && !isMongo ? 8 : 7}
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
                  onValueChange={(v) => v && setEdit({ ...edit, type: v })}
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

      {/* Rename collection dialog (MongoDB) */}
      <Dialog open={showRename} onOpenChange={setShowRename}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Rename Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">New name</label>
              <Input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="new_collection_name"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            {renameMutation.isError && (
              <p className="text-xs text-destructive">{renameMutation.error.message}</p>
            )}
            <Button
              className="w-full h-9"
              onClick={() => renameInput.trim() && renameMutation.mutate(renameInput.trim())}
              disabled={renameMutation.isPending || !renameInput.trim() || renameInput === selectedTable}
            >
              {renameMutation.isPending ? "Renaming..." : "Rename"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate collection dialog (MongoDB) */}
      <Dialog open={showDuplicate} onOpenChange={setShowDuplicate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Duplicate Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Clone <span className="font-medium text-foreground">{selectedTable}</span> to a new collection.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">New collection name</label>
              <Input
                value={duplicateInput}
                onChange={(e) => setDuplicateInput(e.target.value)}
                placeholder="collection_copy"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            {duplicateMutation.isError && (
              <p className="text-xs text-destructive">{duplicateMutation.error.message}</p>
            )}
            <Button
              className="w-full h-9"
              onClick={() => duplicateInput.trim() && duplicateMutation.mutate(duplicateInput.trim())}
              disabled={duplicateMutation.isPending || !duplicateInput.trim()}
            >
              {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to Capped dialog (MongoDB) */}
      <Dialog open={showConvertCapped} onOpenChange={setShowConvertCapped}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Convert to Capped</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Convert <span className="font-medium text-foreground">{selectedTable}</span> to a capped collection. This is irreversible.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Max size (bytes)</label>
              <Input
                type="number"
                value={convertSize}
                onChange={(e) => setConvertSize(e.target.value)}
                className="h-9 text-sm"
                min={1}
              />
              <p className="text-[10px] text-muted-foreground">
                Oldest documents are automatically removed when size is reached.
              </p>
            </div>
            {convertCappedMutation.isError && (
              <p className="text-xs text-destructive">{convertCappedMutation.error.message}</p>
            )}
            <Button
              className="w-full h-9"
              variant="destructive"
              onClick={() => {
                if (!confirm("This will permanently convert the collection to capped. Continue?")) return;
                convertCappedMutation.mutate();
              }}
              disabled={convertCappedMutation.isPending || !convertSize}
            >
              {convertCappedMutation.isPending ? "Converting..." : "Convert to Capped"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schema Validation dialog (MongoDB) */}
      <Dialog open={showValidation} onOpenChange={setShowValidation}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Schema Validation — {selectedTable}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Validator (JSON Schema)</label>
              <textarea
                value={validatorInput}
                onChange={(e) => setValidatorInput(e.target.value)}
                placeholder='{"$jsonSchema": {"bsonType": "object", "required": ["name"], "properties": {"name": {"bsonType": "string"}}}}'
                className="w-full h-32 text-xs font-mono bg-background border border-border rounded p-2 resize-y"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">$jsonSchema</code> for JSON Schema validation.
                Leave empty <code className="bg-muted px-1 rounded">{"{}"}</code> to remove validation.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Validation Level</label>
                <select
                  value={validationLevel}
                  onChange={(e) => setValidationLevel(e.target.value)}
                  className="h-9 w-full text-sm bg-background border border-border rounded px-2"
                >
                  <option value="off">Off</option>
                  <option value="moderate">Moderate</option>
                  <option value="strict">Strict</option>
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Strict: all inserts/updates. Moderate: existing valid docs only.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Validation Action</label>
                <select
                  value={validationAction}
                  onChange={(e) => setValidationAction(e.target.value)}
                  className="h-9 w-full text-sm bg-background border border-border rounded px-2"
                >
                  <option value="error">Error (reject)</option>
                  <option value="warn">Warn (log only)</option>
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Error rejects invalid docs. Warn allows but logs.
                </p>
              </div>
            </div>

            {validation?.validator && (
              <div className="border border-border rounded p-2 bg-muted/30">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Current validator</span>
                <pre className="mt-1 text-[11px] font-mono overflow-x-auto max-h-20">
                  {(() => {
                    try { return JSON.stringify(JSON.parse(validation.validator), null, 2); }
                    catch { return validation.validator; }
                  })()}
                </pre>
              </div>
            )}

            {validationMutation.isError && (
              <p className="text-xs text-destructive">{validationMutation.error.message}</p>
            )}
            <Button
              className="w-full h-9"
              onClick={() => validationMutation.mutate()}
              disabled={validationMutation.isPending}
            >
              {validationMutation.isPending ? "Saving..." : "Save Validation Rules"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
