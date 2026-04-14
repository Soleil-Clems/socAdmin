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
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type IndexType = "regular" | "text" | "2dsphere" | "hashed" | "wildcard";

function formatKeysShort(keys: Record<string, number | string>): string {
  return Object.entries(keys)
    .map(([k, v]) => {
      if (v === 1) return `${k} ↑`;
      if (v === -1) return `${k} ↓`;
      return `${k}: ${v}`;
    })
    .join(", ");
}

function detectIndexType(keys: Record<string, number | string>): string {
  const values = Object.values(keys);
  if (values.includes("text")) return "TEXT";
  if (values.includes("2dsphere")) return "GEO";
  if (values.includes("hashed")) return "HASH";
  const keyNames = Object.keys(keys);
  if (keyNames.some((k) => k.includes("$**"))) return "WILD";
  return "";
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
  const { toast } = useToast();
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

  // --- Mutations ---

  const invalidateIndexes = () => {
    queryClient.invalidateQueries({ queryKey: ["mongo-indexes", selectedDb, selectedTable] });
  };

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof databaseRequest.mongoCreateIndex>[2]) =>
      databaseRequest.mongoCreateIndex(selectedDb, selectedTable, data),
    onSuccess: () => {
      invalidateIndexes();
      setShowCreate(false);
      resetForm();
      toast("Index created", "success");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const dropMutation = useMutation({
    mutationFn: (name: string) =>
      databaseRequest.mongoDropIndex(selectedDb, selectedTable, name),
    onSuccess: () => { invalidateIndexes(); toast("Index dropped", "success"); },
    onError: (e) => toast(e.message, "error"),
  });

  const hideMutation = useMutation({
    mutationFn: ({ name, hidden }: { name: string; hidden: boolean }) =>
      databaseRequest.mongoSetIndexHidden(selectedDb, selectedTable, name, hidden),
    onSuccess: () => { invalidateIndexes(); toast("Index visibility updated", "success"); },
    onError: (e) => toast(e.message, "error"),
  });

  // --- Create form state ---

  const [showCreate, setShowCreate] = useState(false);
  const [indexType, setIndexType] = useState<IndexType>("regular");

  // Compound key builder
  const [keyFields, setKeyFields] = useState<{ field: string; dir: string }[]>([
    { field: "", dir: "1" },
  ]);
  const addKeyField = () => setKeyFields([...keyFields, { field: "", dir: "1" }]);
  const removeKeyField = (i: number) => setKeyFields(keyFields.filter((_, j) => j !== i));
  const updateKeyField = (i: number, patch: Partial<{ field: string; dir: string }>) =>
    setKeyFields(keyFields.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const [nameInput, setNameInput] = useState("");
  const [uniqueInput, setUniqueInput] = useState(false);
  const [sparseInput, setSparseInput] = useState(false);
  const [hiddenInput, setHiddenInput] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ttlInput, setTtlInput] = useState("");
  const [partialFilterInput, setPartialFilterInput] = useState("");
  const [collationInput, setCollationInput] = useState("");
  const [wildcardProjInput, setWildcardProjInput] = useState("");
  const [defaultLangInput, setDefaultLangInput] = useState("");
  const [textWeightsInput, setTextWeightsInput] = useState("");

  const resetForm = () => {
    setIndexType("regular");
    setKeyFields([{ field: "", dir: "1" }]);
    setNameInput("");
    setUniqueInput(false);
    setSparseInput(false);
    setHiddenInput(false);
    setShowAdvanced(false);
    setTtlInput("");
    setPartialFilterInput("");
    setCollationInput("");
    setWildcardProjInput("");
    setDefaultLangInput("");
    setTextWeightsInput("");
  };

  // Build keys JSON from the key builder
  function buildKeysJSON(): string {
    const obj: Record<string, unknown> = {};
    for (const kf of keyFields) {
      if (!kf.field.trim()) continue;
      switch (indexType) {
        case "text":
          obj[kf.field.trim()] = "text";
          break;
        case "2dsphere":
          obj[kf.field.trim()] = "2dsphere";
          break;
        case "hashed":
          obj[kf.field.trim()] = "hashed";
          break;
        case "wildcard":
          obj["$**"] = 1;
          return JSON.stringify(obj);
        default:
          obj[kf.field.trim()] = parseInt(kf.dir);
      }
    }
    return JSON.stringify(obj);
  }

  const canCreate = keyFields.some((kf) => kf.field.trim() !== "") || indexType === "wildcard";

  const handleCreate = () => {
    const keysJSON = buildKeysJSON();
    // Validate JSON fragments
    for (const v of [partialFilterInput, collationInput, wildcardProjInput, textWeightsInput]) {
      if (v.trim()) {
        try { JSON.parse(v); } catch { return; }
      }
    }
    createMutation.mutate({
      keys: keysJSON,
      unique: uniqueInput,
      sparse: sparseInput,
      hidden: hiddenInput,
      name: nameInput,
      ttl_seconds: ttlInput ? parseInt(ttlInput, 10) || 0 : 0,
      partial_filter: partialFilterInput.trim(),
      collation: collationInput.trim(),
      wildcard_proj: wildcardProjInput.trim(),
      default_language: defaultLangInput.trim(),
      text_weights: textWeightsInput.trim(),
    });
  };

  const handleDrop = async (name: string) => {
    if (!await confirm({ title: "Drop index", message: `Drop index "${name}"? This cannot be undone.`, confirmLabel: "Drop", variant: "destructive" })) return;
    dropMutation.mutate(name);
  };

  const handleToggleHidden = (name: string, currentlyHidden: boolean) => {
    hideMutation.mutate({ name, hidden: !currentlyHidden });
  };

  if (!selectedTable) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a collection to view indexes
      </div>
    );
  }

  // Direction options for regular indexes
  const dirOptions = [
    { value: "1", label: "ASC (1)" },
    { value: "-1", label: "DESC (-1)" },
  ];

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
            {indexes?.map((idx) => {
              const typeTag = detectIndexType(idx.keys);
              return (
                <div
                  key={idx.name}
                  className={`border border-border rounded-lg bg-card p-3 flex items-start gap-3 group hover:border-primary/30 transition-colors ${
                    idx.hidden ? "opacity-60" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">
                    {idx.name === "_id_" ? "PK" : "Ix"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {idx.hidden && (
                        <span className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">
                          HIDDEN
                        </span>
                      )}
                      {idx.ttl != null && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded font-medium">
                          TTL: {idx.ttl}s
                        </span>
                      )}
                      {typeTag && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                          {typeTag}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      {formatKeysShort(idx.keys)}
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
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleToggleHidden(idx.name, !!idx.hidden)}
                        disabled={hideMutation.isPending}
                        className="text-[11px] text-primary hover:bg-primary/10 px-2 py-1 rounded"
                      >
                        {idx.hidden ? "Unhide" : "Hide"}
                      </button>
                      <button
                        onClick={() => handleDrop(idx.name)}
                        disabled={dropMutation.isPending}
                        className="text-[11px] text-destructive hover:bg-destructive/10 px-2 py-1 rounded"
                      >
                        Drop
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {(!indexes || indexes.length === 0) && (
              <div className="text-center text-muted-foreground py-16 text-sm">
                No indexes found
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {(dropMutation.isError || hideMutation.isError) && (
        <div className="px-3 py-2 border-t border-destructive/20 bg-destructive/5 text-xs text-destructive">
          {(dropMutation.error ?? hideMutation.error)?.message}
        </div>
      )}

      {/* Create index dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Create Index on {selectedTable}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Index type selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Index type</label>
              <Select value={indexType} onValueChange={(v) => setIndexType(v as IndexType)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular (ASC/DESC)</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="2dsphere">2dsphere (Geo)</SelectItem>
                  <SelectItem value="hashed">Hashed</SelectItem>
                  <SelectItem value="wildcard">Wildcard ($**)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Compound key builder */}
            {indexType !== "wildcard" && (
              <div className="space-y-2">
                <label className="text-xs font-medium">Fields</label>
                {keyFields.map((kf, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={kf.field}
                      onChange={(e) => updateKeyField(i, { field: e.target.value })}
                      placeholder="field name"
                      className="flex-1 h-8 text-sm font-mono"
                    />
                    {indexType === "regular" && (
                      <Select value={kf.dir} onValueChange={(v) => { if (v) updateKeyField(i, { dir: v }); }}>
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dirOptions.map((d) => (
                            <SelectItem key={d.value} value={d.value}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {keyFields.length > 1 && (
                      <button
                        onClick={() => removeKeyField(i)}
                        className="text-xs text-destructive hover:bg-destructive/10 px-1.5 py-1 rounded shrink-0"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addKeyField}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Add field (compound)
                </button>
              </div>
            )}

            {indexType === "wildcard" && (
              <p className="text-[11px] text-muted-foreground">
                Indexes all fields in the collection using <code className="text-[10px] bg-muted px-1 py-0.5 rounded">$**</code>.
                Use wildcard projection in advanced options to include/exclude fields.
              </p>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Name (optional)</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Auto-generated if empty"
                className="h-9 text-sm"
              />
            </div>

            {/* Flags */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox checked={uniqueInput} onCheckedChange={(v) => setUniqueInput(!!v)} />
                <label className="text-xs font-medium">Unique</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={sparseInput} onCheckedChange={(v) => setSparseInput(!!v)} />
                <label className="text-xs font-medium">Sparse</label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={hiddenInput} onCheckedChange={(v) => setHiddenInput(!!v)} />
                <label className="text-xs font-medium">Hidden</label>
              </div>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] text-primary hover:underline text-left"
            >
              {showAdvanced ? "▾ Hide advanced" : "▸ Advanced options"}
            </button>

            {showAdvanced && (
              <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/30">
                {/* TTL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">TTL (seconds)</label>
                  <Input
                    type="number"
                    value={ttlInput}
                    onChange={(e) => setTtlInput(e.target.value)}
                    placeholder="e.g. 3600"
                    className="h-8 text-xs"
                    min={0}
                  />
                </div>

                {/* Partial filter */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Partial filter (JSON)</label>
                  <Input
                    value={partialFilterInput}
                    onChange={(e) => setPartialFilterInput(e.target.value)}
                    placeholder='{"status": "active"}'
                    className="h-8 text-xs font-mono"
                    spellCheck={false}
                  />
                </div>

                {/* Collation */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Collation (JSON)</label>
                  <Input
                    value={collationInput}
                    onChange={(e) => setCollationInput(e.target.value)}
                    placeholder='{"locale": "en", "strength": 2}'
                    className="h-8 text-xs font-mono"
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Case-insensitive search: strength 2. Accent-insensitive: strength 1.
                  </p>
                </div>

                {/* Wildcard projection */}
                {indexType === "wildcard" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Wildcard projection (JSON)</label>
                    <Input
                      value={wildcardProjInput}
                      onChange={(e) => setWildcardProjInput(e.target.value)}
                      placeholder='{"fieldA": 1, "fieldB": 0}'
                      className="h-8 text-xs font-mono"
                      spellCheck={false}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Include (1) or exclude (0) fields from the wildcard index.
                    </p>
                  </div>
                )}

                {/* Text index options */}
                {indexType === "text" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Default language</label>
                      <Input
                        value={defaultLangInput}
                        onChange={(e) => setDefaultLangInput(e.target.value)}
                        placeholder="english"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Text weights (JSON)</label>
                      <Input
                        value={textWeightsInput}
                        onChange={(e) => setTextWeightsInput(e.target.value)}
                        placeholder='{"title": 10, "body": 5}'
                        className="h-8 text-xs font-mono"
                        spellCheck={false}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Higher weight = more relevance in text search results.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {createMutation.isError && (
              <p className="text-xs text-destructive">{createMutation.error.message}</p>
            )}

            <Button
              className="w-full h-9"
              onClick={handleCreate}
              disabled={createMutation.isPending || !canCreate}
            >
              {createMutation.isPending ? "Creating..." : "Create Index"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
