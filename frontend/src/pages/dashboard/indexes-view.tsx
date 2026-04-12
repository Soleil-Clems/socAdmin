import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest, type MongoIndex } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
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
import { useConfirm } from "@/components/ui/confirm-dialog";

function formatKeys(keys: Record<string, number>): string {
  return Object.entries(keys)
    .map(([k, v]) => `${k}: ${v === 1 ? "ASC" : v === -1 ? "DESC" : v}`)
    .join(", ");
}

function formatKeysShort(keys: Record<string, number>): string {
  return Object.entries(keys)
    .map(([k, v]) => `${k}${v === -1 ? " ↓" : " ↑"}`)
    .join(", ");
}

type IndexUsageStat = {
  name: string;
  ops: number;
  since: string;
};

export default function IndexesView() {
  const { selectedDb, selectedTable } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showUsage, setShowUsage] = useState(false);

  const { data: indexes, isLoading } = useQuery<MongoIndex[]>({
    queryKey: ["mongo-indexes", selectedDb, selectedTable],
    queryFn: () => databaseRequest.mongoListIndexes(selectedDb, selectedTable),
    enabled: !!selectedDb && !!selectedTable,
  });

  const { data: usageStats } = useQuery<IndexUsageStat[]>({
    queryKey: ["mongo-index-stats", selectedDb, selectedTable],
    queryFn: () => databaseRequest.mongoIndexUsageStats(selectedDb, selectedTable),
    enabled: !!selectedDb && !!selectedTable && showUsage,
  });

  const usageMap = new Map((usageStats ?? []).map((s) => [s.name, s]));

  const createMutation = useMutation({
    mutationFn: (data: { keys: string; unique: boolean; name: string; sparse: boolean; ttlSeconds: number; partialFilter: string }) =>
      databaseRequest.mongoCreateIndex(selectedDb, selectedTable, data.keys, data.unique, data.name, data.sparse, data.ttlSeconds, data.partialFilter),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-indexes", selectedDb, selectedTable] });
      setShowCreate(false);
      resetForm();
    },
  });

  const dropMutation = useMutation({
    mutationFn: (name: string) =>
      databaseRequest.mongoDropIndex(selectedDb, selectedTable, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-indexes", selectedDb, selectedTable] });
    },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [keysInput, setKeysInput] = useState('{"field": 1}');
  const [uniqueInput, setUniqueInput] = useState(false);
  const [sparseInput, setSparseInput] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [ttlInput, setTtlInput] = useState("");
  const [partialFilterInput, setPartialFilterInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const resetForm = () => {
    setKeysInput('{"field": 1}');
    setUniqueInput(false);
    setSparseInput(false);
    setNameInput("");
    setTtlInput("");
    setPartialFilterInput("");
    setShowAdvanced(false);
  };

  const handleCreate = () => {
    try {
      JSON.parse(keysInput);
    } catch {
      return;
    }
    if (partialFilterInput.trim()) {
      try { JSON.parse(partialFilterInput); } catch { return; }
    }
    createMutation.mutate({
      keys: keysInput,
      unique: uniqueInput,
      name: nameInput,
      sparse: sparseInput,
      ttlSeconds: ttlInput ? parseInt(ttlInput, 10) || 0 : 0,
      partialFilter: partialFilterInput.trim() || "",
    });
  };

  const handleDrop = async (name: string) => {
    if (!await confirm({ title: "Drop index", message: `Drop index "${name}"? This cannot be undone.`, confirmLabel: "Drop", variant: "destructive" })) return;
    dropMutation.mutate(name);
  };

  if (!selectedTable) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a collection to view indexes
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Indexes</span>
        <span className="text-muted-foreground">
          {selectedTable} · {indexes?.length ?? 0} indexes
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant={showUsage ? "secondary" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setShowUsage(!showUsage)}
          >
            {showUsage ? "Hide Usage" : "Usage Stats"}
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => { resetForm(); setShowCreate(true); }}
            >
              + Index
            </Button>
          )}
        </div>
      </div>

      {/* Index list */}
      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2">
            {indexes?.map((idx) => (
              <div
                key={idx.name}
                className="border border-border rounded-lg bg-card p-3 flex items-start gap-3 group hover:border-primary/30 transition-colors"
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">
                  {idx.name === "_id_" ? "PK" : "Ix"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{idx.name}</span>
                    {idx.unique && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                        UNIQUE
                      </span>
                    )}
                    {idx.sparse && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                        SPARSE
                      </span>
                    )}
                    {idx.ttl != null && (
                      <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded font-medium">
                        TTL: {idx.ttl}s
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    {formatKeysShort(idx.keys)}
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {formatKeys(idx.keys)}
                  </div>
                  {showUsage && usageMap.has(idx.name) && (
                    <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                      <span className={`font-medium ${
                        (usageMap.get(idx.name)!.ops === 0 && idx.name !== "_id_")
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground"
                      }`}>
                        {usageMap.get(idx.name)!.ops.toLocaleString()} ops
                      </span>
                      <span className="text-muted-foreground/60">
                        since {new Date(usageMap.get(idx.name)!.since).toLocaleDateString()}
                      </span>
                      {usageMap.get(idx.name)!.ops === 0 && idx.name !== "_id_" && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                          UNUSED
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {isAdmin && idx.name !== "_id_" && (
                  <button
                    onClick={() => handleDrop(idx.name)}
                    disabled={dropMutation.isPending}
                    className="text-[11px] text-destructive hover:bg-destructive/10 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    Drop
                  </button>
                )}
              </div>
            ))}

            {(!indexes || indexes.length === 0) && (
              <div className="text-center text-muted-foreground py-16 text-sm">
                No indexes found
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {dropMutation.isError && (
        <div className="px-3 py-2 border-t border-destructive/20 bg-destructive/5 text-xs text-destructive">
          {dropMutation.error.message}
        </div>
      )}

      {/* Create index dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Create Index on {selectedTable}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Keys (JSON)</label>
              <Input
                value={keysInput}
                onChange={(e) => setKeysInput(e.target.value)}
                placeholder='{"field": 1, "other": -1}'
                className="font-mono text-sm h-9"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                1 = ascending, -1 = descending. Compound: {`{"a": 1, "b": -1}`}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Name (optional)</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Auto-generated if empty"
                className="h-9 text-sm"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={uniqueInput}
                  onCheckedChange={(v) => setUniqueInput(!!v)}
                />
                <label className="text-xs font-medium">Unique</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={sparseInput}
                  onCheckedChange={(v) => setSparseInput(!!v)}
                />
                <label className="text-xs font-medium">Sparse</label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] text-primary hover:underline text-left"
            >
              {showAdvanced ? "▾ Hide advanced" : "▸ Advanced options (TTL, partial filter)"}
            </button>

            {showAdvanced && (
              <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/30">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">TTL (seconds)</label>
                  <Input
                    type="number"
                    value={ttlInput}
                    onChange={(e) => setTtlInput(e.target.value)}
                    placeholder="e.g. 3600 (1 hour)"
                    className="h-8 text-xs"
                    min={0}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Auto-delete documents after N seconds. Requires a Date field key.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Partial filter expression (JSON)</label>
                  <Input
                    value={partialFilterInput}
                    onChange={(e) => setPartialFilterInput(e.target.value)}
                    placeholder='e.g. {"status": "active"}'
                    className="h-8 text-xs font-mono"
                    spellCheck={false}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Only index documents matching this filter.
                  </p>
                </div>
              </div>
            )}

            {createMutation.isError && (
              <p className="text-xs text-destructive">{createMutation.error.message}</p>
            )}

            <Button
              className="w-full h-9"
              onClick={handleCreate}
              disabled={createMutation.isPending || !keysInput.trim()}
            >
              {createMutation.isPending ? "Creating..." : "Create Index"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
