import { useEffect, useState, useCallback } from "react";
import {
  StartServer,
  StopServer,
  GetServerStatus,
  GetConfig,
  GetAllServices,
  SetPort,
  SetAutoStart,
  SetOpenOnStart,
  SetServicePort,
  StartService,
  StopService,
  OpenBrowser,
  GetSystemInfo,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { main } from "../wailsjs/go/models";

type Tab = "server" | "databases" | "settings";

function App() {
  const [status, setStatus] = useState<main.ServerStatus | null>(null);
  const [config, setConfig] = useState<main.AppConfig | null>(null);
  const [services, setServices] = useState<main.ServiceStatus[]>([]);
  const [sysInfo, setSysInfo] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("server");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [s, c, svcs] = await Promise.all([
      GetServerStatus(),
      GetConfig(),
      GetAllServices(),
    ]);
    setStatus(s);
    setConfig(c);
    setServices(svcs);
  }, []);

  useEffect(() => {
    refresh();
    GetSystemInfo().then(setSysInfo);

    const interval = setInterval(async () => {
      const [s, svcs] = await Promise.all([
        GetServerStatus(),
        GetAllServices(),
      ]);
      setStatus(s);
      setServices(svcs);
    }, 3000);

    const off1 = EventsOn("server:started", () => {
      setLoading(false);
      setError("");
      refresh();
    });
    const off2 = EventsOn("server:stopped", () => {
      setLoading(false);
      refresh();
    });
    const off3 = EventsOn("app:error", (msg: string) => {
      setLoading(false);
      setError(msg);
    });
    const off4 = EventsOn("service:started", () => refresh());
    const off5 = EventsOn("service:stopped", () => refresh());

    return () => {
      clearInterval(interval);
      off1();
      off2();
      off3();
      off4();
      off5();
    };
  }, [refresh]);

  const handleStart = async () => {
    setError("");
    setLoading(true);
    await StartServer();
  };

  const handleStop = async () => {
    setError("");
    setLoading(true);
    const s = await StopServer();
    setStatus(s);
    setLoading(false);
  };

  const running = status?.running ?? false;
  const installedCount = services.filter((s) => s.installed && s.running).length;

  return (
    <div className="flex h-full flex-col">
      {/* macOS title bar — drag region */}
      <div className="drag-region flex h-13 shrink-0 items-center justify-between border-b border-border-subtle/60 px-5">
        <div className="flex items-center gap-2.5 pl-18">
          <div className="h-4 w-4 rounded bg-brand" />
          <span className="text-[13px] font-semibold tracking-tight text-text-secondary">
            socAdmin
          </span>
        </div>
        <div className="flex items-center gap-1.5 pr-1">
          <span
            className={`inline-block h-[7px] w-[7px] rounded-full transition-colors ${
              running
                ? "bg-green shadow-[0_0_6px_var(--color-green)]"
                : "bg-text-muted/50"
            }`}
          />
          <span className="text-[11px] text-text-muted">
            {running ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="flex w-48 shrink-0 flex-col border-r border-border-subtle/60 bg-surface/30 px-3 pb-3 pt-4">
          <div className="space-y-0.5">
            <SidebarItem
              icon={<IconServer />}
              label="Server"
              active={tab === "server"}
              onClick={() => setTab("server")}
            />
            <SidebarItem
              icon={<IconDatabase />}
              label="Databases"
              active={tab === "databases"}
              onClick={() => setTab("databases")}
              badge={installedCount}
            />
            <SidebarItem
              icon={<IconSettings />}
              label="Settings"
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            />
          </div>

          <div className="mt-auto pt-3 border-t border-border-subtle/40">
            <p className="text-[10px] text-text-muted/60 px-2.5 leading-relaxed">
              {sysInfo.os && (
                <span className="capitalize">
                  {sysInfo.os} · {sysInfo.arch}
                </span>
              )}
            </p>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-7 py-6">
          {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

          {tab === "server" && (
            <ServerTab
              status={status}
              loading={loading}
              onStart={handleStart}
              onStop={handleStop}
              onOpenBrowser={OpenBrowser}
            />
          )}
          {tab === "databases" && (
            <DatabasesTab services={services} onRefresh={refresh} />
          )}
          {tab === "settings" && (
            <SettingsTab
              config={config}
              onRefresh={refresh}
              running={running}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Error banner ── */

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-red-subtle/80 px-3.5 py-3 text-[13px] text-red">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 shrink-0 opacity-80">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="flex-1 leading-snug">{message}</span>
      <button onClick={onDismiss} className="text-red/50 hover:text-red shrink-0 -mt-0.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* ── Icons ── */

function IconServer() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/* ── Sidebar item ── */

function SidebarItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[13px] transition-colors ${
        active
          ? "bg-surface-active text-text font-medium"
          : "text-text-secondary hover:bg-surface-hover hover:text-text"
      }`}
    >
      <span className={active ? "opacity-100" : "opacity-60"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] bg-green-subtle text-green min-w-[18px] text-center py-[1px] rounded-full font-medium leading-tight">
          {badge}
        </span>
      )}
    </button>
  );
}

/* ── Spinner ── */

function Spinner() {
  return <span className="spinner" />;
}

/* ── Server tab ── */

function ServerTab({
  status,
  loading,
  onStart,
  onStop,
  onOpenBrowser,
}: {
  status: main.ServerStatus | null;
  loading: boolean;
  onStart: () => void;
  onStop: () => void;
  onOpenBrowser: () => void;
}) {
  const running = status?.running ?? false;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold">Server</h2>
        <p className="mt-0.5 text-[13px] text-text-muted">
          Manage your socAdmin instance
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 ${
                running
                  ? "bg-green-subtle text-green"
                  : "bg-surface-hover text-text-muted"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
                <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
                <line x1="6" x2="6.01" y1="6" y2="6" />
                <line x1="6" x2="6.01" y1="18" y2="18" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold">
                  {running ? "Running" : "Stopped"}
                </h3>
                {running && status?.pid && (
                  <span className="rounded-full bg-green-subtle px-2 py-[1px] text-[10px] font-medium text-green">
                    PID {status.pid}
                  </span>
                )}
              </div>
              {running ? (
                <p className="mt-0.5 text-[13px] text-text-secondary truncate">
                  <span className="font-mono text-text">localhost:{status?.port}</span>
                  {status?.uptime && (
                    <span className="ml-1.5 text-text-muted">· {status.uptime}</span>
                  )}
                </p>
              ) : (
                <p className="mt-0.5 text-[13px] text-text-muted">
                  Port {status?.port}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {running && (
              <button
                onClick={onOpenBrowser}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-[7px] text-[13px] text-text-secondary hover:bg-surface-hover hover:text-text"
              >
                <IconExternal />
                Open
              </button>
            )}
            <button
              onClick={running ? onStop : onStart}
              disabled={loading}
              className={`flex items-center gap-2 rounded-lg px-5 py-[7px] text-[13px] font-medium ${
                running
                  ? "bg-red-subtle text-red hover:bg-red-subtle/80"
                  : "bg-brand text-white hover:bg-brand-hover"
              } disabled:opacity-50 disabled:pointer-events-none`}
            >
              {loading ? <Spinner /> : running ? "Stop" : "Start"}
            </button>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="Port" value={String(status?.port ?? "—")} />
        <StatCard
          label="Status"
          value={running ? "Online" : "Offline"}
          accent={running ? "green" : undefined}
        />
        <StatCard label="Uptime" value={status?.uptime || "—"} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green";
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface/50 px-3.5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className={`mt-1 text-[15px] font-semibold tabular-nums ${
        accent === "green" ? "text-green" : "text-text"
      }`}>
        {value}
      </p>
    </div>
  );
}

/* ── Databases tab ── */

function DatabasesTab({
  services,
  onRefresh,
}: {
  services: main.ServiceStatus[];
  onRefresh: () => void;
}) {
  const [loadingService, setLoadingService] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState("");
  const [editingPort, setEditingPort] = useState<string | null>(null);
  const [portInput, setPortInput] = useState("");

  const installed = services.filter((svc) => svc.installed);

  const handleToggle = async (svc: main.ServiceStatus) => {
    setServiceError("");
    setLoadingService(svc.name);
    if (svc.running) {
      await StopService(svc.name);
    } else {
      await StartService(svc.name);
    }
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const svcs = await GetAllServices();
      const updated = svcs.find((s) => s.name === svc.name);
      if (updated && updated.running !== svc.running) {
        clearInterval(poll);
        setLoadingService(null);
        onRefresh();
      } else if (attempts >= 15) {
        clearInterval(poll);
        setLoadingService(null);
        onRefresh();
      }
    }, 1000);
  };

  const handlePortSave = async (name: string) => {
    const p = parseInt(portInput, 10);
    if (isNaN(p) || p < 1024 || p > 65535) {
      setServiceError("Port must be between 1024 and 65535");
      return;
    }
    try {
      await SetServicePort(name, p);
      setEditingPort(null);
      onRefresh();
    } catch (e: unknown) {
      setServiceError(e instanceof Error ? e.message : String(e));
    }
  };

  const dbStyles: Record<string, { bg: string; text: string; letter: string }> = {
    MySQL:      { bg: "bg-blue-subtle",  text: "text-blue",  letter: "My" },
    PostgreSQL: { bg: "bg-amber-subtle", text: "text-amber", letter: "Pg" },
    MongoDB:    { bg: "bg-green-subtle", text: "text-green", letter: "Mg" },
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold">Databases</h2>
        <p className="mt-0.5 text-[13px] text-text-muted">
          Manage database engines on your machine
        </p>
      </div>

      {serviceError && (
        <ErrorBanner message={serviceError} onDismiss={() => setServiceError("")} />
      )}

      {installed.length === 0 ? (
        <div className="rounded-xl border border-border-subtle border-dashed bg-surface/30 px-6 py-10 text-center">
          <p className="text-[13px] text-text-secondary">No database engines detected</p>
          <p className="mt-1 text-[12px] text-text-muted">
            Install MySQL, PostgreSQL, or MongoDB via Homebrew or MAMP
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {installed.map((svc) => {
            const style = dbStyles[svc.name] || { bg: "bg-surface-hover", text: "text-text-muted", letter: "?" };
            const isEditing = editingPort === svc.name;
            const isLoading = loadingService === svc.name;

            return (
              <div
                key={svc.name}
                className="rounded-xl border border-border bg-surface px-4 py-3.5"
              >
                <div className="flex items-center gap-3.5">
                  {/* Badge */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-[11px] font-bold shrink-0 ${style.bg} ${style.text}`}>
                    {style.letter}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold">{svc.name}</h3>
                      {svc.running && (
                        <span className="h-1.5 w-1.5 rounded-full bg-green shadow-[0_0_4px_var(--color-green)]" />
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted truncate mt-px">
                      {svc.version || svc.path}
                    </p>
                  </div>

                  {/* Port */}
                  <div className="shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1024}
                          max={65535}
                          value={portInput}
                          onChange={(e) => setPortInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handlePortSave(svc.name);
                            if (e.key === "Escape") setEditingPort(null);
                          }}
                          className="w-[72px] rounded-md border border-border bg-bg px-2 py-1 text-[12px] text-text outline-none focus:border-brand"
                          autoFocus
                        />
                        <button
                          onClick={() => handlePortSave(svc.name)}
                          className="rounded-md bg-brand px-2 py-1 text-[10px] font-medium text-white hover:bg-brand-hover"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingPort(null)}
                          className="rounded-md px-1.5 py-1 text-text-muted hover:text-text"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingPort(svc.name); setPortInput(String(svc.port)); }}
                        disabled={svc.running}
                        className="font-mono text-[12px] text-text-secondary hover:text-text disabled:opacity-40 disabled:cursor-default px-1.5 py-0.5 rounded hover:bg-surface-hover"
                        title={svc.running ? "Stop the service to change port" : "Click to change port"}
                      >
                        :{svc.port}
                      </button>
                    )}
                  </div>

                  {/* Start/Stop */}
                  <button
                    onClick={() => handleToggle(svc)}
                    disabled={isLoading}
                    className={`shrink-0 rounded-lg px-3.5 py-[6px] text-[12px] font-medium min-w-[56px] flex items-center justify-center ${
                      svc.running
                        ? "bg-red-subtle text-red hover:bg-red-subtle/70"
                        : "bg-green-subtle text-green hover:bg-green-subtle/70"
                    } disabled:opacity-50 disabled:pointer-events-none`}
                  >
                    {isLoading ? <Spinner /> : svc.running ? "Stop" : "Start"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Settings tab ── */

function SettingsTab({
  config,
  onRefresh,
  running,
}: {
  config: main.AppConfig | null;
  onRefresh: () => void;
  running: boolean;
}) {
  const [portInput, setPortInput] = useState("");
  const [portError, setPortError] = useState("");

  useEffect(() => {
    if (config) setPortInput(String(config.port));
  }, [config]);

  if (!config) return null;

  const handlePortSave = async () => {
    const p = parseInt(portInput, 10);
    if (isNaN(p)) return;
    setPortError("");
    try {
      await SetPort(p);
      onRefresh();
    } catch (e: unknown) {
      setPortError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold">Settings</h2>
        <p className="mt-0.5 text-[13px] text-text-muted">
          Configure socAdmin Manager
        </p>
      </div>

      {/* Port */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-[13px] font-semibold">Server Port</h3>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Port for the socAdmin web interface
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={1024}
            max={65535}
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePortSave()}
            disabled={running}
            className="w-24 rounded-lg border border-border bg-bg px-3 py-[7px] text-[13px] text-text outline-none focus:border-brand disabled:opacity-40"
          />
          <button
            onClick={handlePortSave}
            disabled={running || portInput === String(config.port)}
            className="rounded-lg bg-brand px-3.5 py-[7px] text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-30 disabled:pointer-events-none"
          >
            Save
          </button>
          {running && (
            <span className="text-[12px] text-amber">Stop the server first</span>
          )}
        </div>
        {portError && <p className="mt-2 text-[12px] text-red">{portError}</p>}
      </div>

      {/* Toggles */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3.5">
        <h3 className="text-[13px] font-semibold">Startup</h3>

        <ToggleRow
          label="Auto-start server"
          description="Start socAdmin when the manager opens"
          checked={config.autoStart}
          onChange={(v) => { SetAutoStart(v); onRefresh(); }}
        />
        <div className="border-t border-border-subtle/50" />
        <ToggleRow
          label="Open browser on start"
          description="Open localhost automatically"
          checked={config.openOnStart}
          onChange={(v) => { SetOpenOnStart(v); onRefresh(); }}
        />
      </div>

      {/* DB Ports */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-[13px] font-semibold">Database Ports</h3>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Change these in the Databases tab
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <PortCard label="MySQL" port={config.mysqlPort} />
          <PortCard label="PostgreSQL" port={config.pgPort} />
          <PortCard label="MongoDB" port={config.mongoPort} />
        </div>
      </div>
    </div>
  );
}

function PortCard({ label, port }: { label: string; port: number }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2.5 border border-border-subtle/60">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-[13px] text-text">{port}</p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px]">{label}</p>
        <p className="text-[11px] text-text-muted mt-px">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[40px] rounded-full shrink-0 transition-colors ${
          checked ? "bg-brand" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : ""
          }`}
        />
      </button>
    </div>
  );
}

export default App;
