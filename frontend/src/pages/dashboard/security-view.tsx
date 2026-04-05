import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { securityRequest, type WhitelistResponse } from "@/requests/security.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export default function SecurityView() {
  const queryClient = useQueryClient();
  const [newIP, setNewIP] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<WhitelistResponse>({
    queryKey: ["security", "whitelist"],
    queryFn: securityRequest.getWhitelist,
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => securityRequest.toggleWhitelist(enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["security", "whitelist"] }),
    onError: (e: Error) => setError(e.message),
  });

  const addMutation = useMutation({
    mutationFn: (ip: string) => securityRequest.addIP(ip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security", "whitelist"] });
      setNewIP("");
      setError("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (ip: string) => securityRequest.removeIP(ip),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["security", "whitelist"] }),
    onError: (e: Error) => setError(e.message),
  });

  const handleAddIP = () => {
    const trimmed = newIP.trim();
    if (!trimmed) return;
    // Basic IP validation
    const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    if (!ipv4.test(trimmed) && !ipv6.test(trimmed)) {
      setError("Invalid IP address format");
      return;
    }
    addMutation.mutate(trimmed);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  const whitelist = data;
  const isEnabled = whitelist?.enabled ?? false;
  const ips = whitelist?.ips ?? [];
  const clientIP = whitelist?.client_ip ?? "unknown";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Security Settings</span>
        <span className="text-muted-foreground">IP Whitelist &amp; Access Control</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 max-w-2xl space-y-6">

          {/* Client IP info */}
          <div className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2">
            <span className="text-muted-foreground">Your current IP:</span>
            <code className="font-mono text-foreground font-medium">{clientIP}</code>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between border border-border rounded px-4 py-3">
            <div>
              <p className="text-sm font-medium">IP Whitelist</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEnabled
                  ? "Only whitelisted IPs can access the server"
                  : "All IPs can access the server"}
              </p>
            </div>
            <button
              onClick={() => toggleMutation.mutate(!isEnabled)}
              disabled={toggleMutation.isPending}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isEnabled ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  isEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Warning when enabling with no IPs */}
          {isEnabled && ips.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              Whitelist is enabled but empty — all IPs are currently allowed. Add at least one IP to restrict access.
            </div>
          )}

          {/* Warning if your IP isn't whitelisted */}
          {isEnabled && ips.length > 0 && !ips.includes(clientIP) && (
            <div className="bg-destructive/10 border border-destructive/30 rounded px-3 py-2 text-xs text-destructive">
              Your current IP ({clientIP}) is not in the whitelist. You may lose access if you don't add it.
            </div>
          )}

          {/* Add IP */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
              Add IP Address
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newIP}
                onChange={(e) => { setNewIP(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleAddIP()}
                placeholder="e.g. 192.168.1.100"
                className="flex-1 h-8 px-3 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <button
                onClick={handleAddIP}
                disabled={addMutation.isPending || !newIP.trim()}
                className="h-8 px-4 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setNewIP(clientIP); setError(""); }}
                className="h-8 px-3 text-xs text-muted-foreground border border-border rounded hover:bg-accent transition-colors"
                title="Use your current IP"
              >
                My IP
              </button>
            </div>
            {error && (
              <p className="text-xs text-destructive mt-1">{error}</p>
            )}
          </div>

          {/* IP list */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
              Whitelisted IPs ({ips.length})
            </label>
            {ips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No IPs whitelisted yet.</p>
            ) : (
              <div className="border border-border rounded divide-y divide-border">
                {ips.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between px-3 py-2 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm">{ip}</code>
                      {ip === clientIP && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          you
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeMutation.mutate(ip)}
                      disabled={removeMutation.isPending}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security info */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            <p><strong>CSRF Protection</strong> — Double-submit cookie pattern, active on all state-changing requests</p>
            <p><strong>Rate Limiting</strong> — 200 requests/minute per IP with sliding window</p>
            <p><strong>Security Headers</strong> — X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy</p>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
