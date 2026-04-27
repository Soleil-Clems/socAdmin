// @soleil-clems: Component - Explain plan visualizer
import { useState } from "react";

type ExplainData = Record<string, unknown> & {
  error?: string;
  nReturned?: number;
  totalDocsExamined?: number;
  totalKeysExamined?: number;
  executionTimeMs?: number;
  winningPlan?: unknown;
};

type Stage = {
  stage: string;
  inputStage?: Stage;
  inputStages?: Stage[];
  indexName?: string;
  keyPattern?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  direction?: string;
  [key: string]: unknown;
};

// Stage icons + color mapping
const STAGE_INFO: Record<string, { icon: string; color: string; desc: string }> = {
  COLLSCAN: { icon: "◉", color: "text-red-600 dark:text-red-400 bg-red-500/10", desc: "Full collection scan — no index used" },
  IXSCAN: { icon: "◆", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10", desc: "Index scan" },
  FETCH: { icon: "↓", color: "text-blue-600 dark:text-blue-400 bg-blue-500/10", desc: "Retrieve full document" },
  SORT: { icon: "↕", color: "text-amber-600 dark:text-amber-400 bg-amber-500/10", desc: "In-memory sort" },
  SORT_KEY_GENERATOR: { icon: "↕", color: "text-amber-600 dark:text-amber-400 bg-amber-500/10", desc: "Generate sort keys" },
  LIMIT: { icon: "⊤", color: "text-purple-600 dark:text-purple-400 bg-purple-500/10", desc: "Limit results" },
  SKIP: { icon: "⊥", color: "text-purple-600 dark:text-purple-400 bg-purple-500/10", desc: "Skip results" },
  PROJECTION: { icon: "⊞", color: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10", desc: "Field projection" },
  PROJECTION_DEFAULT: { icon: "⊞", color: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10", desc: "Field projection" },
  PROJECTION_SIMPLE: { icon: "⊞", color: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10", desc: "Field projection" },
  PROJECTION_COVERED: { icon: "⊞", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10", desc: "Covered projection (index-only)" },
  SUBPLAN: { icon: "⊕", color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10", desc: "Composite plan" },
  SHARD_MERGE: { icon: "⊗", color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10", desc: "Merge shards" },
  EOF: { icon: "∅", color: "text-muted-foreground bg-muted", desc: "End of file" },
};

function getStageInfo(stage: string) {
  return STAGE_INFO[stage] || { icon: "●", color: "text-slate-600 dark:text-slate-400 bg-slate-500/10", desc: stage };
}

function StageNode({ stage, depth = 0 }: { stage: Stage; depth?: number }) {
  const info = getStageInfo(stage.stage);
  const children: Stage[] = stage.inputStage
    ? [stage.inputStage]
    : stage.inputStages ?? [];

  return (
    <div className="relative">
      <div
        className="flex items-start gap-2 py-1.5"
        style={{ paddingLeft: depth * 16 }}
      >
        {depth > 0 && (
          <span className="text-muted-foreground/40 font-mono text-xs mt-0.5 -ml-3">└</span>
        )}
        <span
          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${info.color}`}
          title={info.desc}
        >
          {info.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-foreground">
              {stage.stage}
            </span>
            {stage.indexName != null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
                idx: {String(stage.indexName)}
              </span>
            )}
            {stage.direction != null && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {String(stage.direction)}
              </span>
            )}
          </div>
          {stage.keyPattern != null && (
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
              {JSON.stringify(stage.keyPattern)}
            </div>
          )}
          {stage.filter != null && (
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">
              filter: {JSON.stringify(stage.filter)}
            </div>
          )}
        </div>
      </div>
      {children.map((child, i) => (
        <StageNode key={i} stage={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function hasStage(stage: Stage | undefined, name: string): boolean {
  if (!stage) return false;
  if (stage.stage === name) return true;
  if (stage.inputStage && hasStage(stage.inputStage, name)) return true;
  if (stage.inputStages) {
    for (const s of stage.inputStages) {
      if (hasStage(s, name)) return true;
    }
  }
  return false;
}

export default function ExplainPlan({
  data,
  onClose,
}: {
  data: ExplainData;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  if ("error" in data && data.error) {
    return (
      <div className="px-3 py-2 border-b border-destructive/20 bg-destructive/5 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-destructive">Explain failed</span>
        <span className="text-xs text-destructive flex-1">{String(data.error)}</span>
        <button
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
    );
  }

  const returned = Number(data.nReturned ?? 0);
  const docsExamined = Number(data.totalDocsExamined ?? 0);
  const keysExamined = Number(data.totalKeysExamined ?? 0);
  const execTime = Number(data.executionTimeMs ?? 0);
  const plan = data.winningPlan as Stage | undefined;

  // Efficiency = returned / examined (1.0 = perfect index match)
  const efficiency = docsExamined > 0 ? returned / docsExamined : returned > 0 ? 1 : 0;
  const isCollscan = hasStage(plan, "COLLSCAN");
  const isIxscan = hasStage(plan, "IXSCAN");

  // Verdict
  let verdict: { label: string; tone: string; msg: string };
  if (isCollscan && docsExamined > 100) {
    verdict = {
      label: "Poor",
      tone: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30",
      msg: "Full collection scan on a large dataset. Consider adding an index.",
    };
  } else if (efficiency < 0.1 && docsExamined > 100) {
    verdict = {
      label: "Inefficient",
      tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
      msg: `Examined ${docsExamined} docs to return ${returned}. Index could be more selective.`,
    };
  } else if (isIxscan && efficiency > 0.8) {
    verdict = {
      label: "Optimal",
      tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      msg: "Query uses an efficient index with high selectivity.",
    };
  } else if (isIxscan) {
    verdict = {
      label: "Good",
      tone: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30",
      msg: "Query uses an index.",
    };
  } else {
    verdict = {
      label: "OK",
      tone: "text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/30",
      msg: "Small dataset — scan is acceptable.",
    };
  }

  const efficiencyPct = Math.round(efficiency * 100);

  return (
    <div className="border-b border-border bg-card">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Explain Plan
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${verdict.tone}`}
        >
          {verdict.label}
        </span>
        <span className="text-[11px] text-muted-foreground truncate flex-1">
          {verdict.msg}
        </span>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border"
        >
          {showRaw ? "Visual" : "Raw"}
        </button>
        <button
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {showRaw ? (
        <pre className="text-[10px] font-mono bg-muted/40 p-3 overflow-x-auto max-h-64">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div className="p-3 grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-3">
          {/* Left: stats */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-border bg-background p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Returned</div>
                <div className="text-lg font-bold tabular-nums text-foreground">{returned}</div>
              </div>
              <div className="rounded border border-border bg-background p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Time</div>
                <div className="text-lg font-bold tabular-nums text-foreground">
                  {execTime}
                  <span className="text-xs font-normal text-muted-foreground ml-0.5">ms</span>
                </div>
              </div>
              <div className="rounded border border-border bg-background p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Docs examined</div>
                <div className="text-lg font-bold tabular-nums text-foreground">{docsExamined}</div>
              </div>
              <div className="rounded border border-border bg-background p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Keys examined</div>
                <div className="text-lg font-bold tabular-nums text-foreground">{keysExamined}</div>
              </div>
            </div>

            {/* Efficiency bar */}
            <div className="rounded border border-border bg-background p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Efficiency
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
                  {efficiencyPct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    efficiency > 0.8
                      ? "bg-emerald-500"
                      : efficiency > 0.3
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(100, efficiencyPct)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {returned} returned / {docsExamined} examined
              </p>
            </div>
          </div>

          {/* Right: stage tree */}
          <div className="rounded border border-border bg-background p-2 min-h-0">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
              Execution pipeline
            </div>
            {plan ? (
              <div className="max-h-48 overflow-y-auto">
                <StageNode stage={plan} />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">No plan available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
