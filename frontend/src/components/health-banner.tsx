// @soleil-clems: Component - Backend health status banner
import { useHealthCheck } from "@/hooks/use-health-check";

export function HealthBanner() {
  const { status, countdown, retry } = useHealthCheck();

  if (status === "ok") return null;

  if (status === "reconnected") {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-emerald-600/95 backdrop-blur-sm text-white text-xs py-2 font-medium shadow-lg">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Server reconnected
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600/95 backdrop-blur-sm text-white shadow-lg">
      <div className="flex items-center justify-center gap-3 py-2.5 px-4 text-xs font-medium">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>
          Server unreachable
          <span className="opacity-70 ml-1.5">
            · retry in {countdown}s
          </span>
        </span>
        <button
          onClick={retry}
          className="ml-1 px-2.5 py-0.5 rounded bg-white/15 hover:bg-white/25 transition-colors text-[11px] font-semibold"
        >
          Retry now
        </button>
      </div>
      <div
        className="h-0.5 bg-white/30 transition-all duration-1000 ease-linear"
        style={{ width: `${(countdown / 15) * 100}%` }}
      />
    </div>
  );
}
