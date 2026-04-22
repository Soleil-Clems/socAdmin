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
  InstallService,
  UninstallService,
  CanInstallServices,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { main } from "../wailsjs/go/models";

type Tab = "server" | "databases" | "settings";
type Theme = "light" | "dark";

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = () => setThemeState((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}

function App() {
  const { theme, toggle: toggleTheme } = useTheme();
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
    GetSystemInfo().then((info) => {
      setSysInfo(info);
      if (info.os) {
        document.documentElement.setAttribute("data-os", info.os);
      }
    });

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
    const s = await StartServer();
    setStatus(s);
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
      {/* Title bar — drag region. On macOS, traffic lights occupy the top-left
          (the OS overlays them on top of our drag region and stays interactive).
          We center the title absolutely on the window so it stays visually
          centered regardless of OS-specific safe areas on the left. The left
          spacer reserves the traffic-light area so right-cluster actions never
          get pushed under the OS chrome on narrow windows. */}
      <header
        className="drag-region relative flex shrink-0 items-center border-b border-border-subtle/50"
        style={{ height: "var(--titlebar-h)" }}
      >
        {/* Left safe-area spacer — width = traffic-light cluster on macOS, 0 elsewhere */}
        <div
          className="shrink-0"
          style={{ width: "var(--traffic-light-w)" }}
          aria-hidden
        />

        {/* Centered title — absolute so it ignores left/right cluster widths */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className="h-3.5 w-3.5 rounded-sm bg-brand" />
          <span className="text-[13px] font-semibold text-text-secondary tracking-[-0.01em]">
            socAdmin
          </span>
        </div>

        {/* Right cluster — theme toggle + status */}
        <div className="ml-auto flex items-center gap-3 pr-5">
          <button
            onClick={toggleTheme}
            className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full transition-colors ${
                running ? "bg-green" : "bg-text-muted/40"
              }`}
            />
            <span className="text-[11px] text-text-muted">
              {running ? "Running" : "Stopped"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — flex column with proper internal padding rhythm */}
        <nav
          className="flex shrink-0 flex-col border-r border-border-subtle/50 bg-surface/20"
          style={{ width: "var(--sidebar-w)" }}
        >
          <div className="flex flex-1 flex-col gap-1 min-h-0 overflow-y-auto px-4 py-5">
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

          <div className="shrink-0 border-t border-border-subtle/30 px-5 py-4">
            {sysInfo.os && (
              <p className="text-[10px] text-text-muted/50 capitalize leading-relaxed tracking-wide">
                {sysInfo.os} · {sysInfo.arch}
              </p>
            )}
          </div>
        </nav>

        {/* Content — fluid desktop padding, max-width container so wide
            windows don't stretch the layout into a thin spread of cards.
            Bottom padding is larger than top so content doesn't kiss the
            window edge when scrolled to the end. */}
        <main
          className="flex-1 overflow-y-auto"
          style={{
            paddingInline: "var(--content-px)",
            paddingTop: "var(--content-py)",
            paddingBottom: "var(--content-pb)",
          }}
        >
          <div
            className="mx-auto w-full"
            style={{ maxWidth: "var(--content-max)" }}
          >
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
              <SettingsTab config={config} onRefresh={refresh} running={running} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Error banner ── */

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-7 flex items-start gap-3 rounded-lg bg-red-subtle/70 px-4 py-3 text-[13px] text-red leading-snug">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="mt-[2px] shrink-0 opacity-70"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 text-red/40 hover:text-red transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* ── Icons ── */

function IconSun() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function IconServer() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
        active
          ? "bg-surface-active text-text font-medium"
          : "text-text-secondary hover:bg-surface-hover hover:text-text"
      }`}
    >
      <span className={`shrink-0 ${active ? "opacity-100" : "opacity-50"}`}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="min-w-[20px] rounded-full bg-green-subtle px-1.5 py-[1px] text-center text-[10px] font-medium text-green leading-tight">
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--section-gap)" }}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Server</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          Manage your socAdmin instance
        </p>
      </div>

      {/* Status + actions */}
      <div
        className="rounded-xl border border-border bg-surface/60"
        style={{ padding: "var(--card-p)" }}
      >
        <div className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${
                running
                  ? "bg-green-subtle text-green"
                  : "bg-surface-hover text-text-muted"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                <p className="mt-0.5 text-[12px] text-text-secondary truncate">
                  localhost:{status?.port}
                  {status?.uptime && (
                    <span className="text-text-muted"> · {status.uptime}</span>
                  )}
                </p>
              ) : (
                <p className="mt-0.5 text-[12px] text-text-muted">
                  Port {status?.port}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {running && (
              <button
                onClick={onOpenBrowser}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
              >
                <IconExternal />
                Open
              </button>
            )}
            <button
              onClick={running ? onStop : onStart}
              disabled={loading}
              className={`flex items-center gap-2 rounded-lg px-5 py-2 text-[12px] font-medium transition-colors ${
                running
                  ? "bg-red-subtle text-red hover:bg-red-subtle/70"
                  : "bg-brand text-white hover:bg-brand-hover"
              } disabled:opacity-50 disabled:pointer-events-none`}
            >
              {loading ? <Spinner /> : running ? "Stop" : "Start"}
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3.5">
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
    <div className="rounded-lg border border-border-subtle/70 bg-surface/40 px-4 py-3.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
        {label}
      </p>
      <p
        className={`mt-1.5 text-[15px] font-semibold tabular-nums ${
          accent === "green" ? "text-green" : "text-text"
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
  const [installingService, setInstallingService] = useState<string | null>(null);
  const [uninstallingService, setUninstallingService] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState("");
  const [editingPort, setEditingPort] = useState<string | null>(null);
  const [portInput, setPortInput] = useState("");
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    CanInstallServices().then(setCanInstall);
  }, []);

  // Listen for install/uninstall events
  useEffect(() => {
    const off1 = EventsOn("install:done", () => {
      setInstallingService(null);
      onRefresh();
    });
    const off2 = EventsOn("uninstall:done", () => {
      setUninstallingService(null);
      onRefresh();
    });
    const off3 = EventsOn("app:error", () => {
      setInstallingService(null);
      setUninstallingService(null);
    });
    return () => { off1(); off2(); off3(); };
  }, [onRefresh]);

  const installed = services.filter((svc) => svc.installed);
  const notInstalled = services.filter((svc) => !svc.installed);

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

  const handleInstall = (name: string) => {
    setServiceError("");
    setInstallingService(name);
    InstallService(name);
    // Poll for install completion (service becomes detected)
    const poll = setInterval(async () => {
      const svcs = await GetAllServices();
      const svc = svcs.find((s) => s.name === name);
      if (svc && svc.installed) {
        clearInterval(poll);
        setInstallingService(null);
        onRefresh();
      }
    }, 3000);
    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(poll);
      if (installingService === name) {
        setInstallingService(null);
        onRefresh();
      }
    }, 300000);
  };

  const handleUninstallConfirm = (name: string) => {
    setConfirmUninstall(null);
    setServiceError("");
    setUninstallingService(name);
    UninstallService(name);
    const poll = setInterval(async () => {
      const svcs = await GetAllServices();
      const svc = svcs.find((s) => s.name === name);
      if (svc && !svc.installed) {
        clearInterval(poll);
        setUninstallingService(null);
        onRefresh();
      }
    }, 3000);
    setTimeout(() => {
      clearInterval(poll);
      setUninstallingService(null);
      onRefresh();
    }, 300000);
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

  const dbStyles: Record<
    string,
    { bg: string; text: string; letter: string }
  > = {
    MySQL: { bg: "bg-blue-subtle", text: "text-blue", letter: "My" },
    PostgreSQL: { bg: "bg-amber-subtle", text: "text-amber", letter: "Pg" },
    MongoDB: { bg: "bg-green-subtle", text: "text-green", letter: "Mg" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--section-gap)" }}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Databases</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          Manage database engines on your machine
        </p>
      </div>

      {serviceError && (
        <ErrorBanner
          message={serviceError}
          onDismiss={() => setServiceError("")}
        />
      )}

      {/* Installed services */}
      {installed.length > 0 && (
        <div className="space-y-3">
          {installed.map((svc) => {
            const style = dbStyles[svc.name] || {
              bg: "bg-surface-hover",
              text: "text-text-muted",
              letter: "?",
            };
            const isEditing = editingPort === svc.name;
            const isLoading = loadingService === svc.name;

            return (
              <div
                key={svc.name}
                className="rounded-xl border border-border bg-surface/60 px-5 py-[18px]"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg text-[11px] font-bold shrink-0 ${style.bg} ${style.text}`}
                  >
                    {style.letter}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold">{svc.name}</h3>
                      {svc.running && (
                        <span className="h-1.5 w-1.5 rounded-full bg-green" />
                      )}
                      {svc.source && (
                        <span className="rounded-full bg-surface-hover px-1.5 py-px text-[9px] font-medium text-text-muted uppercase tracking-wider">
                          {svc.source}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-muted truncate" title={svc.path}>
                      {svc.version || svc.path}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
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
                          className="w-18 rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] text-text outline-none focus:border-brand"
                          autoFocus
                        />
                        <button
                          onClick={() => handlePortSave(svc.name)}
                          className="rounded-md bg-brand px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-brand-hover"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingPort(null)}
                          className="rounded-md px-1.5 py-1.5 text-text-muted hover:text-text"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingPort(svc.name);
                          setPortInput(String(svc.port));
                        }}
                        disabled={svc.running}
                        className="font-mono text-[12px] text-text-secondary hover:text-text disabled:opacity-40 disabled:cursor-default px-2 py-1 rounded-md hover:bg-surface-hover transition-colors"
                        title={
                          svc.running
                            ? "Stop the service to change port"
                            : "Click to change port"
                        }
                      >
                        :{svc.port}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggle(svc)}
                      disabled={isLoading || uninstallingService === svc.name}
                      className={`rounded-lg px-4 py-2 text-[12px] font-medium min-w-15 flex items-center justify-center transition-colors ${
                        svc.running
                          ? "bg-red-subtle text-red hover:bg-red-subtle/70"
                          : "bg-green-subtle text-green hover:bg-green-subtle/70"
                      } disabled:opacity-50 disabled:pointer-events-none`}
                    >
                      {isLoading ? <Spinner /> : svc.running ? "Stop" : "Start"}
                    </button>
                    {svc.source && svc.source !== "system" && svc.source !== "mamp" && !svc.running && (
                      <button
                        onClick={() => setConfirmUninstall(svc.name)}
                        disabled={uninstallingService === svc.name}
                        className="rounded-lg px-2.5 py-2 text-[12px] text-text-muted hover:text-red hover:bg-red-subtle/50 transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
                        title={`Uninstall ${svc.name}`}
                      >
                        {uninstallingService === svc.name ? (
                          <Spinner />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Not installed services */}
      {notInstalled.length > 0 && canInstall && (
        <div>
          {installed.length > 0 && (
            <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-3">
              Available to install
            </p>
          )}
          <div className="space-y-2">
            {notInstalled.map((svc) => {
              const style = dbStyles[svc.name] || {
                bg: "bg-surface-hover",
                text: "text-text-muted",
                letter: "?",
              };
              const isInstalling = installingService === svc.name;

              return (
                <div
                  key={svc.name}
                  className="rounded-xl border border-dashed border-border-subtle bg-surface/20 px-5 py-[18px]"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg text-[11px] font-bold shrink-0 opacity-40 ${style.bg} ${style.text}`}
                    >
                      {style.letter}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-[13px] font-semibold text-text-secondary">
                        {svc.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        Not installed
                      </p>
                    </div>

                    <button
                      onClick={() => handleInstall(svc.name)}
                      disabled={isInstalling}
                      className="shrink-0 rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                    >
                      {isInstalling ? (
                        <>
                          <Spinner />
                          Installing...
                        </>
                      ) : (
                        "Install"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nothing at all */}
      {installed.length === 0 && (!canInstall || notInstalled.length === 0) && (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface/20 px-6 py-14 text-center">
          <p className="text-[13px] text-text-secondary">
            No database engines detected
          </p>
          <p className="mt-2 text-[12px] text-text-muted">
            Install MySQL, PostgreSQL, or MongoDB to get started
          </p>
        </div>
      )}

      {/* Uninstall confirmation dialog */}
      {confirmUninstall && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-[2px]"
          style={{ padding: "var(--content-px)" }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 space-y-5 shadow-2xl shadow-black/40">
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-subtle text-red">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <h3 className="text-[14px] font-semibold">
                  Uninstall {confirmUninstall}?
                </h3>
                <p className="mt-1.5 text-[12px] text-text-muted leading-relaxed">
                  This will remove {confirmUninstall} from your machine.
                  Your databases and data may be deleted. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmUninstall(null)}
                className="rounded-lg px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUninstallConfirm(confirmUninstall)}
                className="rounded-lg bg-red-subtle px-4 py-2 text-[12px] font-medium text-red hover:bg-red-subtle/70 transition-colors"
              >
                Uninstall
              </button>
            </div>
          </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--section-gap)" }}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Settings</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          Configure socAdmin Manager
        </p>
      </div>

      {/* Port */}
      <section
        className="rounded-xl border border-border bg-surface/60"
        style={{ padding: "var(--card-p)" }}
      >
        <h3 className="text-[13px] font-semibold">Server Port</h3>
        <p className="mt-1 text-[12px] text-text-muted">
          Port for the socAdmin web interface
        </p>
        <div className="mt-5 flex items-center gap-2.5">
          <input
            type="number"
            min={1024}
            max={65535}
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePortSave()}
            disabled={running}
            className="w-24 rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none focus:border-brand disabled:opacity-40"
          />
          <button
            onClick={handlePortSave}
            disabled={running || portInput === String(config.port)}
            className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            Save
          </button>
          {running && (
            <span className="text-[12px] text-amber">Stop the server first</span>
          )}
        </div>
        {portError && (
          <p className="mt-2.5 text-[12px] text-red">{portError}</p>
        )}
      </section>

      {/* Startup toggles */}
      <section
        className="rounded-xl border border-border bg-surface/60 space-y-5"
        style={{ padding: "var(--card-p)" }}
      >
        <h3 className="text-[13px] font-semibold">Startup</h3>

        <ToggleRow
          label="Auto-start server"
          description="Start socAdmin when the manager opens"
          checked={config.autoStart}
          onChange={(v) => {
            SetAutoStart(v);
            onRefresh();
          }}
        />
        <div className="border-t border-border-subtle/40" />
        <ToggleRow
          label="Open browser on start"
          description="Open localhost automatically"
          checked={config.openOnStart}
          onChange={(v) => {
            SetOpenOnStart(v);
            onRefresh();
          }}
        />
      </section>

      {/* DB Ports overview */}
      <section
        className="rounded-xl border border-border bg-surface/60"
        style={{ padding: "var(--card-p)" }}
      >
        <h3 className="text-[13px] font-semibold">Database Ports</h3>
        <p className="mt-1 text-[12px] text-text-muted">
          Change these in the Databases tab
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <PortCard label="MySQL" port={config.mysqlPort} />
          <PortCard label="PostgreSQL" port={config.pgPort} />
          <PortCard label="MongoDB" port={config.mongoPort} />
        </div>
      </section>
    </div>
  );
}

function PortCard({ label, port }: { label: string; port: number }) {
  return (
    <div className="rounded-lg bg-bg px-4 py-3.5 border border-border-subtle/50">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[13px] text-text">{port}</p>
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
        <p className="text-[13px] text-text">{label}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">{description}</p>
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
