// @soleil-clems: Dashboard - routines view
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest, type RoutineInfo } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useState } from "react";

export default function RoutinesView() {
  const { selectedDb } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "PROCEDURE" | "FUNCTION">("all");

  const { data: routines, isLoading } = useQuery<RoutineInfo[]>({
    queryKey: ["routines", selectedDb],
    queryFn: () => databaseRequest.listRoutines(selectedDb),
    enabled: !!selectedDb,
  });

  const dropMutation = useMutation({
    mutationFn: ({ name, type }: { name: string; type: string }) =>
      databaseRequest.dropRoutine(selectedDb, name, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines", selectedDb] });
      toast("Routine dropped", "success");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const handleDrop = async (r: RoutineInfo) => {
    if (!await confirm({ title: `Drop ${r.type.toLowerCase()}`, message: `Drop ${r.type.toLowerCase()} "${r.name}"?`, confirmLabel: "Drop", variant: "destructive" })) return;
    dropMutation.mutate({ name: r.name, type: r.type });
  };

  const filtered = routines?.filter((r) => filter === "all" || r.type === filter) ?? [];
  const procCount = routines?.filter((r) => r.type === "PROCEDURE").length ?? 0;
  const funcCount = routines?.filter((r) => r.type === "FUNCTION").length ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Routines</span>
        <span className="text-muted-foreground">
          {selectedDb} · {procCount} procedures · {funcCount} functions
        </span>
        <div className="ml-auto flex items-center gap-1">
          {(["all", "PROCEDURE", "FUNCTION"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-6 px-2 text-[11px] rounded transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {f === "all" ? "All" : f === "PROCEDURE" ? "Procedures" : "Functions"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground text-sm p-6">
          <div className="max-w-md">
            <div className="font-medium text-foreground mb-1">No routines</div>
            <p>
              Stored procedures and functions are reusable SQL routines stored in the database.
              Create them via the SQL tab.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-1.5">
            {filtered.map((r) => (
              <div
                key={r.name + r.type}
                className="border border-border rounded-lg bg-card p-3 group hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                    r.type === "FUNCTION"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {r.type === "FUNCTION" ? "Fn" : "Pr"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{r.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        r.type === "FUNCTION"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {r.type}
                      </span>
                      {r.return_type && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          returns {r.return_type}
                        </span>
                      )}
                    </div>
                    {r.param_list && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                        ({r.param_list})
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => setExpanded(expanded === r.name ? null : r.name)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        {expanded === r.name ? "Hide source" : "Show source"}
                      </button>
                    </div>
                    {expanded === r.name && (
                      <pre className="mt-2 p-2.5 bg-muted rounded text-[11px] font-mono overflow-x-auto max-h-64 whitespace-pre-wrap">
                        {r.body}
                      </pre>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDrop(r)}
                      disabled={dropMutation.isPending}
                      className="text-[11px] text-destructive hover:bg-destructive/10 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      Drop
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
