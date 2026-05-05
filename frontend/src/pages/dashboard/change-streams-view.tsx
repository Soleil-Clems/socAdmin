// @soleil-clems: Dashboard - change streams view
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigationStore } from "@/stores/navigation.store";
import { API_URL } from "@/lib/custom-fetch";
import type { ChangeEvent } from "@/requests/database.request";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

const OP_COLORS: Record<string, { bg: string; text: string }> = {
  insert: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  update: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  replace: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  delete: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
  drop: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
  rename: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
  invalidate: { bg: "bg-muted", text: "text-muted-foreground" },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

export default function ChangeStreamsView() {
  const { selectedDb, selectedTable } = useNavigationStore();

  const [watching, setWatching] = useState(false);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stopWatching = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setWatching(false);
  }, []);

  const startWatching = useCallback(() => {
    if (!selectedDb || !selectedTable) return;
    setError(null);
    setEvents([]);
    setExpandedIdx(null);

    const url = `${API_URL}/databases/${encodeURIComponent(selectedDb)}/tables/${encodeURIComponent(selectedTable)}/watch`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;
    setWatching(true);

    es.onmessage = (e) => {
      try {
        const evt: ChangeEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, evt]);
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener("error", (e) => {
      // EventSource "error" can be a normal close or a real error
      if (es.readyState === EventSource.CLOSED) {
        stopWatching();
      } else {
        // Try to parse error data if available
        const me = e as MessageEvent;
        if (me.data) {
          try {
            const d = JSON.parse(me.data);
            if (d.error) setError(d.error);
          } catch {
            setError("Connection lost");
          }
        }
      }
    });
  }, [selectedDb, selectedTable, stopWatching]);

  // Cleanup on unmount or collection change
  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [selectedDb, selectedTable]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!selectedTable) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select a collection to watch changes
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Change Streams</span>
        <span className="text-muted-foreground">
          {selectedTable}
        </span>
        {watching && (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
        <span className="text-muted-foreground">{events.length} events</span>
        <div className="ml-auto flex items-center gap-1.5">
          {events.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={() => { setEvents([]); setExpandedIdx(null); }}
            >
              Clear
            </Button>
          )}
          {watching ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs px-3"
              onClick={stopWatching}
            >
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={startWatching}
            >
              Watch
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 border-b border-destructive/20 bg-destructive/5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Event log */}
      {events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground text-sm p-6">
          <div className="max-w-sm">
            {watching ? (
              <>
                <div className="text-3xl mb-3">
                  <span className="animate-pulse">...</span>
                </div>
                <p className="font-medium text-foreground mb-1">Waiting for changes</p>
                <p className="text-xs">
                  Insert, update, or delete documents in <span className="font-mono">{selectedTable}</span> to see events appear here in real time.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground mb-1">Real-time change stream</p>
                <p className="text-xs">
                  Click <span className="font-medium">Watch</span> to start listening for insert, update, and delete events on this collection.
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-2">
                  Requires a MongoDB replica set or sharded cluster.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div ref={scrollRef} className="p-3 space-y-1.5">
            {events.map((evt, i) => {
              const colors = OP_COLORS[evt.operationType] ?? OP_COLORS.invalidate;
              const isExpanded = expandedIdx === i;
              return (
                <div
                  key={i}
                  className="border border-border rounded-lg bg-card overflow-hidden hover:border-primary/30 transition-colors"
                >
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    className="w-full px-3 py-2 flex items-center gap-3 text-left"
                  >
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                      {evt.operationType}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono truncate flex-1">
                      {evt.documentKey?._id
                        ? `_id: ${JSON.stringify(evt.documentKey._id)}`
                        : evt.ns.coll}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {formatTime(evt.timestamp)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {isExpanded && evt.fullDocument && (
                    <div className="border-t border-border bg-muted/30 px-3 py-2">
                      <pre className="text-[11px] text-foreground font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                        {JSON.stringify(evt.fullDocument, null, 2)}
                      </pre>
                    </div>
                  )}

                  {isExpanded && !evt.fullDocument && evt.documentKey && (
                    <div className="border-t border-border bg-muted/30 px-3 py-2">
                      <pre className="text-[11px] text-foreground font-mono whitespace-pre-wrap">
                        {JSON.stringify(evt.documentKey, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
