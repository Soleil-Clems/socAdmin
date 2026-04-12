import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTables } from "@/hooks/queries/use-tables";
import { useNavigationStore } from "@/stores/navigation.store";
import { useConnectionStore } from "@/stores/connection.store";
import { useAuthStore } from "@/stores/auth.store";
import { useDropTable } from "@/hooks/mutations/use-drop-table";
import { useTruncateTable } from "@/hooks/mutations/use-truncate-table";
import { useCreateTable } from "@/hooks/mutations/use-create-table";
import { databaseRequest, type TableColumnDef } from "@/requests/database.request";
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

import { typeOptionsFor } from "@/lib/column-types";

function formatSize(bytes: unknown): string {
  const n = Number(bytes);
  if (!n || isNaN(n)) return "0 B";
  if (n > 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n > 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

const emptyColumn = (): TableColumnDef => ({
  name: "",
  type: "",
  nullable: true,
  primary_key: false,
  auto_increment: false,
  default_value: "",
});

export default function DatabaseView() {
  const { selectedDb, setSelectedTable } = useNavigationStore();
  const dbType = useConnectionStore((s) => s.dbType);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { data: tables, isLoading } = useTables(selectedDb);
  const dropTable = useDropTable();
  const truncateTable = useTruncateTable();
  const createTable = useCreateTable();

  const isMongo = dbType === "mongodb";
  const queryClient = useQueryClient();

  const { data: dbStats } = useQuery({
    queryKey: ["mongo-dbstats", selectedDb],
    queryFn: () => databaseRequest.mongoDatabaseStats(selectedDb),
    enabled: isMongo && !!selectedDb,
  });

  type CollMeta = { name: string; type: string; capped: boolean; documents: number; size: number };
  const { data: collMetas } = useQuery<CollMeta[]>({
    queryKey: ["mongo-coll-meta", selectedDb],
    queryFn: () => databaseRequest.mongoListCollectionsWithMeta(selectedDb),
    enabled: isMongo && !!selectedDb,
  });
  const metaMap = new Map((collMetas ?? []).map((m) => [m.name, m]));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<TableColumnDef[]>([emptyColumn()]);

  // Capped collection
  const [showCapped, setShowCapped] = useState(false);
  const [cappedName, setCappedName] = useState("");
  const [cappedSize, setCappedSize] = useState("10485760"); // 10MB default
  const [cappedMax, setCappedMax] = useState("");
  const cappedMutation = useMutation({
    mutationFn: () =>
      databaseRequest.mongoCreateCappedCollection(selectedDb, cappedName, parseInt(cappedSize, 10), cappedMax ? parseInt(cappedMax, 10) : 0),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", selectedDb] });
      setShowCapped(false);
      setCappedName("");
      setCappedSize("10485760");
      setCappedMax("");
    },
  });

  // Time Series collection
  const [showTS, setShowTS] = useState(false);
  const [tsName, setTsName] = useState("");
  const [tsTimeField, setTsTimeField] = useState("timestamp");
  const [tsMetaField, setTsMetaField] = useState("");
  const [tsGranularity, setTsGranularity] = useState("seconds");
  const [tsExpire, setTsExpire] = useState("");
  const tsMutation = useMutation({
    mutationFn: () =>
      databaseRequest.mongoCreateTimeSeriesCollection(selectedDb, {
        name: tsName,
        timeField: tsTimeField,
        metaField: tsMetaField || undefined,
        granularity: tsGranularity || undefined,
        expireAfterSeconds: tsExpire ? parseInt(tsExpire, 10) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", selectedDb] });
      setShowTS(false);
      setTsName("");
      setTsTimeField("timestamp");
      setTsMetaField("");
      setTsGranularity("seconds");
      setTsExpire("");
    },
  });

  const typeOptions = typeOptionsFor(dbType);

  const toggleSelect = (table: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  };

  const toggleAll = () => {
    if (!tables) return;
    if (selected.size === tables!.length) {
      setSelected(new Set(tables));
    } else {
      setSelected(new Set(tables));
    }
  };

  const handleDrop = (table: string) => {
    if (!confirm(`Drop table "${table}"? This cannot be undone.`)) return;
    dropTable.mutate({ db: selectedDb, table });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(table);
      return next;
    });
  };

  const handleTruncate = (table: string) => {
    if (!confirm(`Truncate table "${table}"? All data will be deleted.`)) return;
    truncateTable.mutate({ db: selectedDb, table });
  };

  const handleBulkDrop = () => {
    if (selected.size === 0) return;
    if (!confirm(`Drop ${selected.size} table(s)? This cannot be undone.`)) return;
    for (const table of selected) {
      dropTable.mutate({ db: selectedDb, table });
    }
    setSelected(new Set());
  };

  const handleBulkTruncate = () => {
    if (selected.size === 0) return;
    if (!confirm(`Truncate ${selected.size} table(s)?`)) return;
    for (const table of selected) {
      truncateTable.mutate({ db: selectedDb, table });
    }
    setSelected(new Set());
  };

  const updateColumn = (index: number, field: keyof TableColumnDef, value: unknown) => {
    setColumns((prev) =>
      prev.map((col, i) => (i === index ? { ...col, [field]: value } : col))
    );
  };

  const removeColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateTable = () => {
    if (!tableName.trim() || columns.some((c) => !c.name || !c.type)) return;
    createTable.mutate(
      { db: selectedDb, name: tableName.trim(), columns },
      {
        onSuccess: () => {
          setShowCreateTable(false);
          setTableName("");
          setColumns([emptyColumn()]);
        },
      }
    );
  };

  const openCreateTable = () => {
    setTableName("");
    setColumns([emptyColumn()]);
    setShowCreateTable(true);
  };

  if (!selectedDb) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a database from the sidebar
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">{selectedDb}</span>
        <span className="text-muted-foreground">{(tables?.length ?? 0)} tables</span>
        {selected.size > 0 && isAdmin && (
          <>
            <span className="text-primary font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2"
              onClick={handleBulkTruncate}
              disabled={truncateTable.isPending}
            >
              Truncate
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[11px] px-2"
              onClick={handleBulkDrop}
              disabled={dropTable.isPending}
            >
              Drop
            </Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {isAdmin && isMongo && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={() => setShowCapped(true)}
              >
                + Capped
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2.5"
                onClick={() => setShowTS(true)}
              >
                + Time Series
              </Button>
            </>
          )}
          {isAdmin && (
            <Button size="sm" className="h-7 text-xs px-3" onClick={openCreateTable}>
              + {isMongo ? "Collection" : "Table"}
            </Button>
          )}
        </div>
      </div>

      {/* MongoDB dbStats */}
      {isMongo && dbStats && (
        <div className="px-3 py-2 border-b border-border bg-muted/20 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
          <div><span className="text-muted-foreground">Collections:</span> <span className="font-medium">{String(dbStats.collections ?? 0)}</span></div>
          <div><span className="text-muted-foreground">Views:</span> <span className="font-medium">{String(dbStats.views ?? 0)}</span></div>
          <div><span className="text-muted-foreground">Objects:</span> <span className="font-medium">{Number(dbStats.objects ?? 0).toLocaleString()}</span></div>
          <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{formatSize(dbStats.dataSize)}</span></div>
          <div><span className="text-muted-foreground">Storage:</span> <span className="font-medium">{formatSize(dbStats.storageSize)}</span></div>
          <div><span className="text-muted-foreground">Indexes:</span> <span className="font-medium">{String(dbStats.indexes ?? 0)} ({formatSize(dbStats.indexSize)})</span></div>
          <div><span className="text-muted-foreground">Total:</span> <span className="font-medium">{formatSize(dbStats.totalSize)}</span></div>
        </div>
      )}

      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <table className="w-full data-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 text-left w-10">
                  <Checkbox
                    checked={(tables?.length ?? 0) > 0 && selected.size === (tables?.length ?? 0)}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Table
                </th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tables?.map((table: string) => {
                const meta = metaMap.get(table);
                return (
                <tr key={table} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
                  <td className="px-3 py-1.5">
                    <Checkbox
                      checked={selected.has(table)}
                      onCheckedChange={() => toggleSelect(table)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedTable(table)}
                        className="text-[13px] font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {table}
                      </button>
                      {meta?.type === "view" && (
                        <span className="text-[9px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1 py-0.5 rounded font-medium">VIEW</span>
                      )}
                      {meta?.capped && (
                        <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1 py-0.5 rounded font-medium">CAPPED</span>
                      )}
                      {isMongo && meta && meta.type !== "view" && (
                        <span className="text-[11px] text-muted-foreground">
                          {meta.documents.toLocaleString()} docs · {formatSize(meta.size)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex justify-end gap-0.5">
                      <button
                        className="px-2 py-0.5 text-[11px] text-foreground hover:bg-accent rounded transition-colors"
                        onClick={() => setSelectedTable(table)}
                      >
                        Browse
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            className="px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground rounded transition-colors"
                            onClick={() => handleTruncate(table)}
                            disabled={truncateTable.isPending}
                          >
                            Truncate
                          </button>
                          <button
                            className="px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors"
                            onClick={() => handleDrop(table)}
                            disabled={dropTable.isPending}
                          >
                            Drop
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {tables?.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted-foreground py-12 text-sm">
                    No tables in this database
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* Create table dialog */}
      <Dialog open={showCreateTable} onOpenChange={setShowCreateTable}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Create table in {selectedDb}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Table name"
              className="h-9"
            />

            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Columns</p>
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={col.name}
                    onChange={(e) => updateColumn(i, "name", e.target.value)}
                    placeholder="Column name"
                    className="flex-1 h-8 text-sm"
                  />
                  {dbType === "mongodb" ? (
                    <Input
                      value={col.type}
                      onChange={(e) => updateColumn(i, "type", e.target.value)}
                      placeholder="Type"
                      className="flex-1 h-8 text-sm"
                    />
                  ) : (
                    <Select
                      value={col.type}
                      onValueChange={(v) => v && updateColumn(i, "type", v)}
                    >
                      <SelectTrigger className="flex-1 h-8 text-sm">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                    <Checkbox
                      checked={col.primary_key}
                      onCheckedChange={(v) => updateColumn(i, "primary_key", !!v)}
                    />
                    PK
                  </label>
                  {!isMongo && (
                    <label className="flex items-center gap-1 text-[11px] whitespace-nowrap" title={dbType === "postgresql" ? "SERIAL (auto-generated ID)" : "AUTO_INCREMENT"}>
                      <Checkbox
                        checked={col.auto_increment}
                        onCheckedChange={(v) => updateColumn(i, "auto_increment", !!v)}
                      />
                      {dbType === "postgresql" ? "Serial" : "AI"}
                    </label>
                  )}
                  <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                    <Checkbox
                      checked={col.nullable}
                      onCheckedChange={(v) => updateColumn(i, "nullable", !!v)}
                    />
                    Null
                  </label>
                  {columns.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive text-xs"
                      onClick={() => removeColumn(i)}
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setColumns([...columns, emptyColumn()])}
              >
                + Add column
              </Button>
            </div>

            <Button
              className="w-full h-9"
              onClick={handleCreateTable}
              disabled={createTable.isPending || !tableName.trim() || columns.some((c) => !c.name || !c.type)}
            >
              {createTable.isPending ? "Creating..." : "Create table"}
            </Button>
            {createTable.isError && (
              <p className="text-xs text-destructive">{createTable.error.message}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create capped collection dialog (MongoDB) */}
      <Dialog open={showCapped} onOpenChange={setShowCapped}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Create Capped Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Collection name</label>
              <Input
                value={cappedName}
                onChange={(e) => setCappedName(e.target.value)}
                placeholder="logs"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Max size (bytes)</label>
              <Input
                type="number"
                value={cappedSize}
                onChange={(e) => setCappedSize(e.target.value)}
                className="h-9 text-sm"
                min={1}
              />
              <p className="text-[10px] text-muted-foreground">
                {formatSize(parseInt(cappedSize, 10) || 0)} — oldest documents are removed when limit is reached
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Max documents (optional)</label>
              <Input
                type="number"
                value={cappedMax}
                onChange={(e) => setCappedMax(e.target.value)}
                placeholder="No limit"
                className="h-9 text-sm"
                min={0}
              />
            </div>
            {cappedMutation.isError && (
              <p className="text-xs text-destructive">{cappedMutation.error.message}</p>
            )}
            <Button
              className="w-full h-9"
              onClick={() => cappedMutation.mutate()}
              disabled={cappedMutation.isPending || !cappedName.trim() || !cappedSize}
            >
              {cappedMutation.isPending ? "Creating..." : "Create Capped Collection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create time series collection dialog (MongoDB) */}
      <Dialog open={showTS} onOpenChange={setShowTS}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Create Time Series Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Optimized storage for time-stamped data (metrics, IoT, logs). Documents are
              automatically bucketed by time for fast range queries and compression.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Collection name</label>
              <Input
                value={tsName}
                onChange={(e) => setTsName(e.target.value)}
                placeholder="metrics"
                className="h-9 text-sm"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Time field *</label>
                <Input
                  value={tsTimeField}
                  onChange={(e) => setTsTimeField(e.target.value)}
                  placeholder="timestamp"
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Must be a Date</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Meta field</label>
                <Input
                  value={tsMetaField}
                  onChange={(e) => setTsMetaField(e.target.value)}
                  placeholder="sensorId"
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Optional grouping</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Granularity</label>
                <select
                  value={tsGranularity}
                  onChange={(e) => setTsGranularity(e.target.value)}
                  className="h-9 w-full text-sm bg-background border border-border rounded px-2"
                >
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                </select>
                <p className="text-[10px] text-muted-foreground">Bucketing rate</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">TTL (seconds)</label>
                <Input
                  type="number"
                  value={tsExpire}
                  onChange={(e) => setTsExpire(e.target.value)}
                  placeholder="0 = no expiry"
                  className="h-9 text-sm"
                  min={0}
                />
                <p className="text-[10px] text-muted-foreground">Auto delete old data</p>
              </div>
            </div>

            {tsMutation.isError && (
              <p className="text-xs text-destructive">{tsMutation.error.message}</p>
            )}
            <Button
              className="w-full h-9"
              onClick={() => tsMutation.mutate()}
              disabled={tsMutation.isPending || !tsName.trim() || !tsTimeField.trim()}
            >
              {tsMutation.isPending ? "Creating..." : "Create Time Series Collection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
