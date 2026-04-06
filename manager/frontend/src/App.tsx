import { useEffect, useState, useCallback } from "react";
import {
  StartServer,
  StopServer,
  GetStatus,
  GetConfig,
  DetectSGBD,
  SetPort,
  SetAutoStart,
  SetOpenOnStart,
  OpenBrowser,
  GetSystemInfo,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { main } from "../wailsjs/go/models";
import {
  Power,
  ExternalLink,
  Database,
  Settings,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

type Tab = "server" | "databases" | "settings";

function App() {
  const [status, setStatus] = useState<main.ServerStatus | null>(null);
  const [config, setConfig] = useState<main.AppConfig | null>(null);
  const [sgbds, setSgbds] = useState<main.SGBDInfo[]>([]);
  const [sysInfo, setSysInfo] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("server");
  const [error, setError] = useState("");
  const [portInput, setPortInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sgbdOpen, setSgbdOpen] = useState(true);

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([GetStatus(), GetConfig()]);
    setStatus(s);
    setConfig(c);
    setPortInput(String(c.port));
  }, []);

  useEffect(() => {
    refresh();
    DetectSGBD().then(setSgbds);
    GetSystemInfo().then(setSysInfo);

    const interval = setInterval(async () => {
      const s = await GetStatus();
      setStatus(s);
    }, 2000);

    const offStarted = EventsOn("server:started", () => {
      setLoading(false);
      setError("");
      refresh();
    });
    const offStopped = EventsOn("server:stopped", () => {
      setLoading(false);
      refresh();
    });
    const offError = EventsOn("server:error", (msg: string) => {
      setLoading(false);
      setError(msg);
    });

    return () => {
      clearInterval(interval);
      offStarted();
      offStopped();
      offError();
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

  const handlePortSave = async () => {
    const p = parseInt(portInput, 10);
    if (isNaN(p)) return;
    try {
      await SetPort(p);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const running = status?.running ?? false;

  return (
    <div className="flex h-full flex-col">
      {/* Title bar / drag region */}
      <div className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-center gap-2 pl-18">
          <div className="h-3.5 w-3.5 rounded-sm bg-brand" />
          <span className="text-xs font-semibold tracking-wide text-text-secondary">
            socAdmin Manager
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              running ? "bg-green shadow-[0_0_6px_var(--color-green)]" : "bg-text-muted"
            }`}
          />
          <span className="text-[11px] text-text-muted">
            {running ? "Running" : "Stopped"}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="flex w-48 shrink-0 flex-col border-r border-border-subtle bg-surface/40 p-3 pt-4">
          <SidebarItem
            icon={<Server size={16} />}
            label="Server"
            active={tab === "server"}
            onClick={() => setTab("server")}
          />
          <SidebarItem
            icon={<Database size={16} />}
            label="Databases"
            active={tab === "databases"}
            onClick={() => setTab("databases")}
          />
          <SidebarItem
            icon={<Settings size={16} />}
            label="Settings"
            active={tab === "settings"}
            onClick={() => setTab("settings")}
          />

          <div className="mt-auto pt-4 border-t border-border-subtle">
            <div className="text-[10px] text-text-muted leading-relaxed px-2">
              {sysInfo.os && (
                <span className="capitalize">{sysInfo.os}/{sysInfo.arch}</span>
              )}
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-subtle p-3 text-sm text-red">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                className="ml-auto text-text-muted hover:text-text"
              >
                ×
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
            <DatabasesTab
              sgbds={sgbds}
              open={sgbdOpen}
              onToggle={() => setSgbdOpen(!sgbdOpen)}
            />
          )}
          {tab === "settings" && (
            <SettingsTab
              config={config}
              portInput={portInput}
              onPortChange={setPortInput}
              onPortSave={handlePortSave}
              onAutoStartChange={(v) => {
                SetAutoStart(v);
                refresh();
              }}
              onOpenOnStartChange={(v) => {
                SetOpenOnStart(v);
                refresh();
              }}
              running={running}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Sidebar item ── */

function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
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
      {label}
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
              <Server size={28} strokeWidth={1.5} />
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
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-secondary transition-colors hover:border-border hover:bg-surface-active hover:text-text"
              >
                <ExternalLink size={14} />
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
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Power size={16} />
              )}
              {running ? "Stop" : "Start"}
            </button>
          </div>
        </div>
      </div>

      {/* Quick info */}
      <div className="grid grid-cols-3 gap-3">
        <InfoCard label="Port" value={String(status?.port ?? "—")} />
        <InfoCard label="Status" value={running ? "Online" : "Offline"} accent={running ? "green" : "muted"} />
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
          accent === "green" ? "text-green" : accent === "muted" ? "text-text-muted" : "text-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ── Databases tab ── */

function DatabasesTab({
  sgbds,
  open,
  onToggle,
}: {
  sgbds: main.SGBDInfo[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Database Engines</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Detected database engines on your system
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <span className="text-sm font-medium">Installed Engines</span>
          {open ? (
            <ChevronUp size={16} className="text-text-muted" />
          ) : (
            <ChevronDown size={16} className="text-text-muted" />
          )}
        </button>

        {open && (
          <div className="border-t border-border-subtle">
            {sgbds.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between border-b border-border-subtle px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      s.installed
                        ? "bg-green-subtle text-green"
                        : "bg-surface-hover text-text-muted"
                    }`}
                  >
                    <Database size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.installed ? (
                      <p className="text-xs text-text-muted truncate max-w-[350px]">
                        {s.version || s.path}
                      </p>
                    ) : (
                      <p className="text-xs text-text-muted">Not detected</p>
                    )}
                  </div>
                </div>
                <div>
                  {s.installed ? (
                    <CheckCircle size={18} className="text-green" />
                  ) : (
                    <XCircle size={18} className="text-text-muted" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Settings tab ── */

function SettingsTab({
  config,
  portInput,
  onPortChange,
  onPortSave,
  onAutoStartChange,
  onOpenOnStartChange,
  running,
}: {
  config: main.AppConfig | null;
  portInput: string;
  onPortChange: (v: string) => void;
  onPortSave: () => void;
  onAutoStartChange: (v: boolean) => void;
  onOpenOnStartChange: (v: boolean) => void;
  running: boolean;
}) {
  if (!config) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Configure how socAdmin Manager behaves
        </p>
      </div>

      {/* Port */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Server Port</h3>
        <p className="mt-1 text-xs text-text-muted">
          The port socAdmin will listen on (1024–65535)
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={1024}
            max={65535}
            value={portInput}
            onChange={(e) => onPortChange(e.target.value)}
            disabled={running}
            className="w-28 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-brand disabled:opacity-40"
          />
          <button
            onClick={onPortSave}
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
      </div>

      {/* Toggles */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <h3 className="text-sm font-semibold">Startup Behavior</h3>

        <ToggleRow
          label="Auto-start server"
          description="Automatically start socAdmin when the manager opens"
          checked={config.autoStart}
          onChange={onAutoStartChange}
        />
        <ToggleRow
          label="Open browser on start"
          description="Open localhost in your default browser when the server starts"
          checked={config.openOnStart}
          onChange={onOpenOnStartChange}
        />
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
