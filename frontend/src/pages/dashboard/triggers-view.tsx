import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest, type TriggerInfo } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useState } from "react";

const TIMING_COLOR: Record<string, string> = {
  BEFORE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  AFTER: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "INSTEAD OF": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

const EVENT_COLOR: Record<string, string> = {
  INSERT: "bg-green-500/10 text-green-600 dark:text-green-400",
  UPDATE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function TriggersView() {
  const { selectedDb } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: triggers, isLoading } = useQuery<TriggerInfo[]>({
    queryKey: ["triggers", selectedDb],
    queryFn: () => databaseRequest.listTriggers(selectedDb),
    enabled: !!selectedDb,
  });

  const dropMutation = useMutation({
    mutationFn: ({ name, table }: { name: string; table: string }) =>
      databaseRequest.dropTrigger(selectedDb, name, table),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers", selectedDb] });
      toast("Trigger dropped", "success");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const handleDrop = async (t: TriggerInfo) => {
    if (!await confirm({ title: "Drop trigger", message: `Drop trigger "${t.name}" on ${t.table}?`, confirmLabel: "Drop", variant: "destructive" })) return;
    dropMutation.mutate({ name: t.name, table: t.table });
  };

  // Group by table
  const grouped = new Map<string, TriggerInfo[]>();
  triggers?.forEach((t) => {
    const list = grouped.get(t.table) || [];
    list.push(t);
    grouped.set(t.table, list);
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Triggers</span>
        <span className="text-muted-foreground">
          {selectedDb} · {triggers?.length ?? 0} triggers
        </span>
      </div>

      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !triggers || triggers.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground text-sm p-6">
          <div className="max-w-md">
            <div className="font-medium text-foreground mb-1">No triggers</div>
            <p>
              Triggers are SQL routines that execute automatically when a row is inserted, updated, or deleted.
              Create one via the SQL tab.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {[...grouped.entries()].map(([table, items]) => (
              <div key={table}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                  {table}
                </p>
                <div className="space-y-1.5">
                  {items.map((t) => (
                    <div
                      key={t.name}
                      className="border border-border rounded-lg bg-card p-3 group hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{t.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TIMING_COLOR[t.timing] || "bg-muted text-muted-foreground"}`}>
                          {t.timing}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${EVENT_COLOR[t.event] || "bg-muted text-muted-foreground"}`}>
                          {t.event}
                        </span>
                        <span className="text-[10px] text-muted-foreground">on {t.table}</span>
                        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setExpanded(expanded === t.name ? null : t.name)}
                            className="text-[11px] text-primary hover:bg-primary/10 px-2 py-1 rounded"
                          >
                            {expanded === t.name ? "Hide" : "Show"} body
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDrop(t)}
                              disabled={dropMutation.isPending}
                              className="text-[11px] text-destructive hover:bg-destructive/10 px-2 py-1 rounded"
                            >
                              Drop
                            </button>
                          )}
                        </div>
                      </div>
                      {expanded === t.name && (
                        <pre className="mt-2 p-2.5 bg-muted rounded text-[11px] font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                          {t.statement}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
