import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { securityRequest, type WhitelistResponse } from "@/requests/security.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth.store";

function ipLabel(ip: string): string | null {
  if (ip === "127.0.0.1" || ip === "::1") return "localhost";
  if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) return "local network";
  return null;
}

export default function SecurityView() {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [newIP, setNewIP] = useState("");
  const [error, setError] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);

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

  const bulkMutation = useMutation({
    mutationFn: (ips: string[]) => securityRequest.bulkAddIPs(ips),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security", "whitelist"] });
      setBulkText("");
      setShowBulk(false);
      setError("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleBulkImport = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    bulkMutation.mutate(lines);
  };

  const handleExport = () => {
    const url = securityRequest.exportURL();
    const token = localStorage.getItem("access_token");
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "whitelist.txt";
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const handleAddIP = () => {
    const trimmed = newIP.trim();
    if (!trimmed) return;
    // Validate IPv4: each octet 0-255
    const ipv4Match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    const isValidIPv4 = ipv4Match && [1, 2, 3, 4].every((i) => {
      const n = parseInt(ipv4Match[i], 10);
      return n >= 0 && n <= 255;
    });
    // Validate IPv6: hex groups separated by colons
    const isValidIPv6 = /^([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$/.test(trimmed) ||
      /^::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/.test(trimmed) ||
      trimmed === "::1";
    if (!isValidIPv4 && !isValidIPv6) {
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
      </div>
    );
  }

  const whitelist = data;
  const isEnabled = whitelist?.enabled ?? false;
  const ips = whitelist?.ips ?? [];
  const clientIP = whitelist?.client_ip ?? "unknown";
  const clientLabel = ipLabel(clientIP);
  const clientIsWhitelisted = ips.includes(clientIP);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Security Settings</span>
        <span className="text-muted-foreground">IP Whitelist &amp; Access Control</span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 max-w-2xl space-y-6">

          {/* Client IP info — prominent */}
          <div className="bg-muted/50 border border-border rounded px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">The server sees your connection as:</p>
            <div className="flex items-center gap-2">
              <code className="font-mono text-base text-foreground font-semibold">{clientIP}</code>
              {clientLabel && (
                <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {clientLabel}
                </span>
              )}
              {isEnabled && clientIsWhitelisted && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  whitelisted
                </span>
              )}
            </div>
            {clientLabel === "localhost" && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                You're accessing socAdmin locally. In production behind a reverse proxy, this will show your real public IP.
              </p>
            )}
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between border border-border rounded px-4 py-3">
            <div>
              <p className="text-sm font-medium">IP Whitelist</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEnabled
                  ? "Only whitelisted IPs can access the server"
                  : "All IPs can access the server (disabled)"}
              </p>
              {!isEnabled && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  When enabled, your current IP will be automatically added.
                </p>
              )}
            </div>
            <button
              onClick={() => toggleMutation.mutate(!isEnabled)}
              disabled={toggleMutation.isPending}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
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

          {/* Warning when enabled but empty */}
          {isEnabled && ips.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              Whitelist is enabled but empty — all IPs are currently allowed. Add at least one IP to start restricting access.
            </div>
          )}

          {/* Warning if your IP isn't whitelisted */}
          {isEnabled && ips.length > 0 && !clientIsWhitelisted && (
            <div className="bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
              <p className="text-xs text-destructive font-medium">
                Your IP ({clientIP}) is not whitelisted — you will be locked out!
              </p>
              <button
                onClick={() => addMutation.mutate(clientIP)}
                disabled={addMutation.isPending}
                className="mt-1.5 text-xs font-medium text-destructive underline hover:no-underline"
              >
                Add my IP now
              </button>
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
                placeholder={`e.g. ${clientIP === "::1" ? "127.0.0.1" : "192.168.1.100"}`}
                className="flex-1 h-8 px-3 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <button
                onClick={handleAddIP}
                disabled={addMutation.isPending || !newIP.trim()}
                className="h-8 px-4 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Add
              </button>
              {!clientIsWhitelisted && (
                <button
                  onClick={() => addMutation.mutate(clientIP)}
                  disabled={addMutation.isPending}
                  className="h-8 px-3 text-xs font-medium border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
                  title={`Add ${clientIP}`}
                >
                  + My IP
                </button>
              )}
            </div>
            {error && (
              <p className="text-xs text-destructive mt-1">{error}</p>
            )}
          </div>

          {/* Bulk import / Export */}
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulk(!showBulk)}
                className="h-8 px-3 text-xs font-medium border border-border rounded hover:bg-accent/40 transition-colors"
              >
                {showBulk ? "Cancel" : "Bulk import"}
              </button>
              {ips.length > 0 && (
                <button
                  onClick={handleExport}
                  className="h-8 px-3 text-xs font-medium border border-border rounded hover:bg-accent/40 transition-colors"
                >
                  Export list
                </button>
              )}
            </div>
          )}

          {showBulk && (
            <div className="space-y-2">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"One IP per line, e.g.:\n192.168.1.100\n10.0.0.50\n# comments are ignored"}
                className="w-full h-32 px-3 py-2 text-sm font-mono bg-background border border-border rounded resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleBulkImport}
                disabled={bulkMutation.isPending || !bulkText.trim()}
                className="h-8 px-4 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {bulkMutation.isPending ? "Importing..." : "Import all"}
              </button>
            </div>
          )}

          {/* IP list */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
              Whitelisted IPs ({ips.length})
            </label>
            {ips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No IPs whitelisted yet.</p>
            ) : (
              <div className="border border-border rounded divide-y divide-border">
                {ips.map((ip) => {
                  const label = ipLabel(ip);
                  return (
                    <div
                      key={ip}
                      className="flex items-center justify-between px-3 py-2 hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm">{ip}</code>
                        {label && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {label}
                          </span>
                        )}
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
                  );
                })}
              </div>
            )}
          </div>

          {/* Security info */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            <p><strong>CSRF Protection</strong> — Double-submit cookie, active on POST/PUT/DELETE</p>
            <p><strong>Rate Limiting</strong> — 200 requests/minute per IP, sliding window</p>
            <p><strong>Security Headers</strong> — X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy</p>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
