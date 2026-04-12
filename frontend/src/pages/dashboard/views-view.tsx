import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

type MongoView = {
  name: string;
  viewOn: string;
  pipeline: string;
};

const PIPELINE_TEMPLATES = [
  { label: "Filter", pipeline: '[{"$match": {"field": "value"}}]' },
  { label: "Group", pipeline: '[{"$group": {"_id": "$field", "count": {"$sum": 1}}}]' },
  { label: "Project", pipeline: '[{"$project": {"field1": 1, "field2": 1, "_id": 0}}]' },
  { label: "Sort + Limit", pipeline: '[{"$sort": {"field": -1}}, {"$limit": 100}]' },
  { label: "Lookup (join)", pipeline: '[{"$lookup": {"from": "other", "localField": "fk", "foreignField": "_id", "as": "joined"}}]' },
];

export default function ViewsView() {
  const { selectedDb } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { data: views, isLoading } = useQuery<MongoView[]>({
    queryKey: ["mongo-views", selectedDb],
    queryFn: () => databaseRequest.mongoListViews(selectedDb),
    enabled: !!selectedDb,
  });

  const { data: tables } = useQuery<string[]>({
    queryKey: ["tables", selectedDb],
    queryFn: () => databaseRequest.listTables(selectedDb),
    enabled: !!selectedDb,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; source: string; pipeline: string }) =>
      databaseRequest.mongoCreateView(selectedDb, data.name, data.source, data.pipeline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-views", selectedDb] });
      queryClient.invalidateQueries({ queryKey: ["tables", selectedDb] });
      setShowCreate(false);
      resetForm();
    },
  });

  const dropMutation = useMutation({
    mutationFn: (name: string) => databaseRequest.dropTable(selectedDb, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-views", selectedDb] });
      queryClient.invalidateQueries({ queryKey: ["tables", selectedDb] });
    },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [sourceInput, setSourceInput] = useState("");
  const [pipelineInput, setPipelineInput] = useState('[{"$match": {}}]');
  const [expandedView, setExpandedView] = useState<string | null>(null);

  const resetForm = () => {
    setNameInput("");
    setSourceInput("");
    setPipelineInput('[{"$match": {}}]');
  };

  const handleCreate = () => {
    if (!nameInput.trim() || !sourceInput.trim()) return;
    try {
      JSON.parse(pipelineInput);
    } catch {
      return;
    }
    createMutation.mutate({ name: nameInput, source: sourceInput, pipeline: pipelineInput });
  };

  const handleDrop = async (name: string) => {
    if (!await confirm({ title: "Drop view", message: `Drop view "${name}"? This cannot be undone.`, confirmLabel: "Drop", variant: "destructive" })) return;
    dropMutation.mutate(name);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Views</span>
        <span className="text-muted-foreground">
          {selectedDb} · {views?.length ?? 0} views
        </span>
        <div className="ml-auto">
          {isAdmin && (
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => { resetForm(); setShowCreate(true); }}
            >
              + View
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2">
            {views?.map((v) => (
              <div
                key={v.name}
                className="border border-border rounded-lg bg-card p-3 group hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 text-xs font-bold shrink-0 mt-0.5">
                    Vw
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{v.name}</span>
                      <span className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded font-medium">
                        VIEW
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Source: <span className="font-mono">{v.viewOn}</span>
                    </div>
                    {v.pipeline && (
                      <button
                        onClick={() => setExpandedView(expandedView === v.name ? null : v.name)}
                        className="text-[11px] text-primary hover:underline mt-1"
                      >
                        {expandedView === v.name ? "▾ Hide pipeline" : "▸ Show pipeline"}
                      </button>
                    )}
                    {expandedView === v.name && v.pipeline && (
                      <pre className="mt-2 p-2 bg-muted rounded text-[11px] font-mono overflow-x-auto max-h-32">
                        {(() => {
                          try { return JSON.stringify(JSON.parse(v.pipeline), null, 2); }
                          catch { return v.pipeline; }
                        })()}
                      </pre>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDrop(v.name)}
                      disabled={dropMutation.isPending}
                      className="text-[11px] text-destructive hover:bg-destructive/10 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      Drop
                    </button>
                  )}
                </div>
              </div>
            ))}

            {(!views || views.length === 0) && (
              <div className="text-center text-muted-foreground py-16 text-sm">
                No views found. Views are virtual collections defined by aggregation pipelines.
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

      {/* Create view dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Create View in {selectedDb}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">View name</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="my_view"
                className="h-9 text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Source collection</label>
              <select
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                className="h-9 w-full text-sm bg-background border border-border rounded px-2"
              >
                <option value="">Select a collection...</option>
                {tables?.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Aggregation pipeline (JSON array)</label>
              <div className="flex gap-1 flex-wrap mb-1.5">
                {PIPELINE_TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setPipelineInput(t.pipeline)}
                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                value={pipelineInput}
                onChange={(e) => setPipelineInput(e.target.value)}
                placeholder='[{"$match": {"status": "active"}}]'
                className="w-full h-28 text-xs font-mono bg-background border border-border rounded p-2 resize-y"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                A JSON array of aggregation stages. The view will always show the result of this pipeline on the source collection.
              </p>
            </div>

            {createMutation.isError && (
              <p className="text-xs text-destructive">{createMutation.error.message}</p>
            )}

            <Button
              className="w-full h-9"
              onClick={handleCreate}
              disabled={createMutation.isPending || !nameInput.trim() || !sourceInput}
            >
              {createMutation.isPending ? "Creating..." : "Create View"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
