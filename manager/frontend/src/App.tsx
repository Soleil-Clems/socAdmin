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

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg">
      {/* Title bar — macOS drag region, clears traffic lights */}
      <div className="drag-region flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-5">
        <div className="flex items-center gap-2 pl-18">
          <div className="h-3.5 w-3.5 rounded-sm bg-brand" />
          <span className="text-xs font-semibold tracking-wide text-text-secondary">
            socAdmin Manager
          </span>
        </div>
        <div className="flex items-center gap-1 pr-1">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              running
                ? "bg-green shadow-[0_0_6px_var(--color-green)]"
                : "bg-text-muted"
            }`}
          />
          <span className="text-[11px] text-text-muted">
            {running ? "Running" : "Stopped"}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="flex w-52 shrink-0 flex-col border-r border-border-subtle bg-surface/40 px-4 py-4">
          <div className="space-y-1">
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
              badge={services.filter((s) => s.installed && s.running).length}
            />
            <SidebarItem
              icon={<IconSettings />}
              label="Settings"
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            />
          </div>

          <div className="mt-auto pt-4 border-t border-border-subtle">
            <div className="text-[10px] text-text-muted leading-relaxed px-2">
              {sysInfo.os && (
                <span className="capitalize">
                  {sysInfo.os}/{sysInfo.arch}
                </span>
              )}
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-8">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-subtle p-3 text-sm text-red">
              <span className="mt-0.5 shrink-0">!</span>
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError("")}
                className="text-text-muted hover:text-text"
              >
                x
              </button>
            </div>
          )}

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

/* ── Icons (inline SVG, no dep) ── */

function IconServer() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
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
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-surface-active text-text"
          : "text-text-secondary hover:bg-surface-hover hover:text-text"
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] bg-green-subtle text-green px-1.5 py-0.5 rounded-full font-medium">
          {badge}
        </span>
      )}
    </button>
  );
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Server Control</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Start and manage your socAdmin instance
        </p>
      </div>

      {/* Big status card */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                running
                  ? "bg-green-subtle text-green"
                  : "bg-surface-hover text-text-muted"
              }`}
            >
              <IconServer />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">
                  {running ? "Server is running" : "Server is stopped"}
                </h3>
                {running && (
                  <span className="rounded-full bg-green-subtle px-2 py-0.5 text-[11px] font-medium text-green">
                    PID {status?.pid}
                  </span>
                )}
              </div>
              {running ? (
                <p className="mt-0.5 text-sm text-text-secondary">
                  Listening on{" "}
                  <span className="font-mono text-text">
                    localhost:{status?.port}
                  </span>
                  {status?.uptime && (
                    <span className="ml-2 text-text-muted">
                      · up {status.uptime}
                    </span>
                  )}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-text-muted">
                  Port {status?.port} · Ready to start
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {running && (
              <button
                onClick={onOpenBrowser}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-active hover:text-text"
              >
                Open
              </button>
            )}
            <button
              onClick={running ? onStop : onStart}
              disabled={loading}
              className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
                running
                  ? "bg-red-subtle text-red hover:bg-red/20"
                  : "bg-brand text-white hover:bg-brand-hover"
              } disabled:opacity-50`}
            >
              {loading ? "..." : running ? "Stop" : "Start"}
            </button>
          </div>
        </div>
      </div>

      {/* Quick info */}
      <div className="grid grid-cols-3 gap-3">
        <InfoCard label="Port" value={String(status?.port ?? "—")} />
        <InfoCard
          label="Status"
          value={running ? "Online" : "Offline"}
          accent={running ? "green" : "muted"}
        />
        <InfoCard label="Uptime" value={status?.uptime || "—"} />
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface/60 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold ${
          accent === "green"
            ? "text-green"
            : accent === "muted"
            ? "text-text-muted"
            : "text-text"
        }`}
      >
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

  const handleToggle = async (svc: main.ServiceStatus) => {
    setServiceError("");
    setLoadingService(svc.name);
    if (svc.running) {
      await StopService(svc.name);
    } else {
      await StartService(svc.name);
    }
    // The Go side runs async and emits events — poll briefly for status change
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

  const dbColors: Record<string, { bg: string; text: string; icon: string }> = {
    MySQL: { bg: "bg-blue-subtle", text: "text-blue", icon: "M" },
    PostgreSQL: { bg: "bg-amber-subtle", text: "text-amber", icon: "P" },
    MongoDB: { bg: "bg-green-subtle", text: "text-green", icon: "M" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Database Engines</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Manage database services on your machine
        </p>
      </div>

      {serviceError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-subtle p-3 text-sm text-red">
          <span className="flex-1">{serviceError}</span>
          <button
            onClick={() => setServiceError("")}
            className="text-text-muted hover:text-text"
          >
            x
          </button>
        </div>
      )}

      <div className="space-y-3">
        {services.filter((svc) => svc.installed).length === 0 && (
          <div className="rounded-xl border border-border-subtle bg-surface/60 p-6 text-center">
            <p className="text-sm text-text-secondary">No database engines detected on this machine.</p>
            <p className="mt-1 text-xs text-text-muted">Install MySQL, PostgreSQL, or MongoDB via Homebrew or MAMP.</p>
          </div>
        )}
        {services.filter((svc) => svc.installed).map((svc) => {
          const colors = dbColors[svc.name] || {
            bg: "bg-surface-hover",
            text: "text-text-muted",
            icon: "?",
          };
          const isEditing = editingPort === svc.name;
          const isLoading = loadingService === svc.name;

          return (
            <div
              key={svc.name}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold ${colors.bg} ${colors.text}`}
                >
                  {colors.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{svc.name}</h3>
                    {svc.running && (
                      <span className="rounded-full bg-green-subtle px-2 py-0.5 text-[10px] font-medium text-green">
                        Running
                      </span>
                    )}
                  </div>
                  {svc.version ? (
                    <p className="text-xs text-text-muted truncate mt-0.5">
                      {svc.version}
                    </p>
                  ) : (
                    <p className="text-xs text-text-muted mt-0.5">
                      {svc.path}
                    </p>
                  )}
                </div>

                {/* Port */}
                <div className="text-right shrink-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1024}
                        max={65535}
                        value={portInput}
                        onChange={(e) => setPortInput(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handlePortSave(svc.name)
                        }
                        className="w-20 rounded border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-brand"
                        autoFocus
                      />
                      <button
                        onClick={() => handlePortSave(svc.name)}
                        className="rounded bg-brand px-2 py-1 text-[10px] font-medium text-white"
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setEditingPort(null)}
                        className="rounded px-2 py-1 text-[10px] text-text-muted hover:text-text"
                      >
                        x
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingPort(svc.name);
                        setPortInput(String(svc.port));
                      }}
                      disabled={svc.running}
                      className="text-xs text-text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-default"
                      title={
                        svc.running
                          ? "Stop the service to change port"
                          : "Click to change port"
                      }
                    >
                      <span className="font-mono text-text">:{svc.port}</span>
                    </button>
                  )}
                </div>

                {/* Start/Stop */}
                <button
                  onClick={() => handleToggle(svc)}
                  disabled={isLoading}
                  className={`shrink-0 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                    svc.running
                      ? "bg-red-subtle text-red hover:bg-red/20"
                      : "bg-green-subtle text-green hover:bg-green/20"
                  } disabled:opacity-50`}
                >
                  {isLoading
                    ? "..."
                    : svc.running
                    ? "Stop"
                    : "Start"}
                </button>
              </div>

              {/* PID info when running */}
              {svc.running && svc.pid > 0 && (
                <div className="mt-2 pt-2 border-t border-border-subtle flex items-center gap-4 text-[11px] text-text-muted">
                  <span>PID {svc.pid}</span>
                  <span>Port {svc.port}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Configure how socAdmin Manager behaves
        </p>
      </div>

      {/* socAdmin Port */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">socAdmin Server Port</h3>
        <p className="mt-1 text-xs text-text-muted">
          The port socAdmin web interface will listen on (1024-65535)
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={1024}
            max={65535}
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            disabled={running}
            className="w-28 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-brand disabled:opacity-40"
          />
          <button
            onClick={handlePortSave}
            disabled={running || portInput === String(config.port)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
          >
            Save
          </button>
          {running && (
            <span className="text-xs text-amber">
              Stop the server to change port
            </span>
          )}
        </div>
        {portError && (
          <p className="mt-2 text-xs text-red">{portError}</p>
        )}
      </div>

      {/* Toggles */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <h3 className="text-sm font-semibold">Startup Behavior</h3>

        <ToggleRow
          label="Auto-start server"
          description="Automatically start socAdmin when the manager opens"
          checked={config.autoStart}
          onChange={(v) => {
            SetAutoStart(v);
            onRefresh();
          }}
        />
        <ToggleRow
          label="Open browser on start"
          description="Open localhost in your default browser when the server starts"
          checked={config.openOnStart}
          onChange={(v) => {
            SetOpenOnStart(v);
            onRefresh();
          }}
        />
      </div>

      {/* SGBD Ports summary */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Database Ports</h3>
        <p className="mt-1 text-xs text-text-muted">
          Default ports for database engines. Change them in the Databases tab.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-bg p-3 border border-border-subtle">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              MySQL
            </p>
            <p className="mt-1 font-mono text-sm text-text">
              {config.mysqlPort}
            </p>
          </div>
          <div className="rounded-lg bg-bg p-3 border border-border-subtle">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              PostgreSQL
            </p>
            <p className="mt-1 font-mono text-sm text-text">
              {config.pgPort}
            </p>
          </div>
          <div className="rounded-lg bg-bg p-3 border border-border-subtle">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              MongoDB
            </p>
            <p className="mt-1 font-mono text-sm text-text">
              {config.mongoPort}
            </p>
          </div>
        </div>
      </div>
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
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-brand" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

export default App;
