// @soleil-clems: Dashboard - MongoDB sharding info
import { useQuery } from "@tanstack/react-query";
import {
  databaseRequest,
  type ShardedClusterInfo,
} from "@/requests/database.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShardingView() {
  const { data, isLoading, error } = useQuery<ShardedClusterInfo>({
    queryKey: ["mongo-cluster-sharding"],
    queryFn: () => databaseRequest.mongoGetClusterShardingInfo(),
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Sharding</span>
        <span className="text-muted-foreground">Cluster topology</span>
        {data?.isSharded && (
          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-semibold">
            SHARDED
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="p-4 text-xs text-destructive">{(error as Error).message}</div>
      ) : !data?.isSharded ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground text-sm p-6">
          <div className="max-w-md">
            <div className="text-4xl mb-3">⊟</div>
            <div className="font-medium text-foreground mb-1">
              Standalone / Replica Set
            </div>
            <p className="leading-relaxed">
              This cluster is not sharded. Sharding distributes data across multiple
              shards for horizontal scaling. Connect to a <code className="bg-muted px-1 rounded">mongos</code> router
              to manage a sharded cluster.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {/* Balancer */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Balancer
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      data.balancerEnabled ? "bg-emerald-500" : "bg-muted-foreground"
                    }`}
                  />
                  <span className="text-xs">
                    {data.balancerEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      data.balancerRunning ? "bg-blue-500 animate-pulse" : "bg-muted-foreground"
                    }`}
                  />
                  <span className="text-xs">
                    {data.balancerRunning ? "Running" : "Idle"}
                  </span>
                </div>
              </div>
            </div>

            {/* Shards */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Shards
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {data.shards.length}
                </span>
              </div>
              {data.shards.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No shards registered
                </div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">
                        Shard
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">
                        Host
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">
                        State
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">
                        Tags
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shards.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-border/50 hover:bg-accent/40"
                      >
                        <td className="px-3 py-2 font-mono font-semibold text-foreground">
                          {s.id}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground break-all">
                          {s.host}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              s.state === 1
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {s.state === 1 ? "ACTIVE" : `STATE ${s.state}`}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {s.tags && s.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {s.tags.map((t) => (
                                <span
                                  key={t}
                                  className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
