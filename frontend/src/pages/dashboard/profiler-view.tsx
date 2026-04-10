import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { useAuthStore } from "@/stores/auth.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProfileEntry = {
  op: string;
  ns: string;
  millis: number;
  ts: string;
  command: string;
  nreturned: number;
  docsExamined: number;
  keysExamined: number;
  planSummary: string;
};

const LEVEL_LABELS: Record<number, string> = {
  0: "Off",
  1: "Slow operations only",
  2: "All operations",
};

export default function ProfilerView() {
  const { selectedDb } = useNavigationStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();

  const { data: profiling, isLoading: levelLoading } = useQuery({
    queryKey: ["mongo-profiling", selectedDb],
    queryFn: () => databaseRequest.mongoGetProfilingLevel(selectedDb),
    enabled: !!selectedDb,
  });

  const { data: entries, isLoading: dataLoading, refetch } = useQuery<ProfileEntry[]>({
    queryKey: ["mongo-profile-data", selectedDb],
    queryFn: () => databaseRequest.mongoGetProfileData(selectedDb, 100),
    enabled: !!selectedDb,
  });

  const [newLevel, setNewLevel] = useState<number | null>(null);
  const [newSlowms, setNewSlowms] = useState("");

  const setMutation = useMutation({
    mutationFn: () => {
      const level = newLevel ?? profiling?.was ?? 0;
      const slowms = newSlowms ? parseInt(newSlowms, 10) : profiling?.slowms ?? 100;
      return databaseRequest.mongoSetProfilingLevel(selectedDb, level, slowms);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mongo-profiling", selectedDb] });
      setNewLevel(null);
      setNewSlowms("");
    },
  });

  const currentLevel = profiling?.was ?? 0;
  const currentSlowms = profiling?.slowms ?? 100;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Database Profiler</span>
        <span className="text-muted-foreground">{selectedDb}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[11px] px-2 ml-auto"
          onClick={() => refetch()}
        >
          Refresh
        </Button>
      </div>

      {/* Config panel */}
      <div className="px-3 py-3 border-b border-border bg-muted/20">
        {levelLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Profiling Level</label>
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setNewLevel(lvl)}
                    className={`h-8 px-3 text-xs rounded border transition-colors ${
                      (newLevel ?? currentLevel) === lvl
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-accent"
                    }`}
                  >
                    {lvl} — {LEVEL_LABELS[lvl]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Slow threshold (ms)</label>
              <Input
                type="number"
                value={newSlowms || String(currentSlowms)}
                onChange={(e) => setNewSlowms(e.target.value)}
                className="h-8 w-24 text-xs"
                min={0}
              />
            </div>
            {isAdmin && (newLevel !== null || newSlowms) && (
              <Button
                size="sm"
                className="h-8 text-xs px-4"
                onClick={() => setMutation.mutate()}
                disabled={setMutation.isPending}
              >
                {setMutation.isPending ? "Saving..." : "Apply"}
              </Button>
            )}
            {setMutation.isError && (
              <span className="text-xs text-destructive">{setMutation.error.message}</span>
            )}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          Level 0: profiling off. Level 1: log operations slower than {currentSlowms}ms. Level 2: log all operations.
        </p>
      </div>

      {/* Profile entries */}
      {dataLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : entries && entries.length > 0 ? (
        <ScrollArea className="flex-1 min-h-0">
          <table className="w-full data-table text-[12px]">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">Op</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">Namespace</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">Duration</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">Docs Exam.</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">Keys Exam.</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase">Returned</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">Plan</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase max-w-[200px]">Command</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-accent/40">
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      e.op === "query" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                      e.op === "insert" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                      e.op === "update" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                      e.op === "remove" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {e.op}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{e.ns}</td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    <span className={e.millis > 100 ? "text-destructive font-semibold" : e.millis > 50 ? "text-amber-600 dark:text-amber-400" : ""}>
                      {e.millis}ms
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{e.docsExamined ?? "-"}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{e.keysExamined ?? "-"}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{e.nreturned ?? "-"}</td>
                  <td className="px-2 py-1.5 text-muted-foreground text-[11px]">{e.planSummary || "-"}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] max-w-[200px] truncate" title={e.command}>
                    {e.command}
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-muted-foreground whitespace-nowrap">{e.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">No profiling data</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              {currentLevel === 0
                ? "Profiling is currently off. Set level to 1 or 2 to start collecting data."
                : "No operations have been captured yet. Run some queries and refresh."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
