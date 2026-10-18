// @soleil-clems: Dashboard - schema view
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { databaseRequest, type SchemaTable } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const TABLE_W = 240;
const COL_H = 24;
const HEADER_H = 32;
const TABLE_PAD = 8;
const GRID_GAP = 48;
const MINIMAP_W = 180;
const MINIMAP_H = 130;
const MINIMAP_PAD = 10;

type Pos = { x: number; y: number };

function tableHeight(t: SchemaTable) {
  return HEADER_H + t.columns.length * COL_H + TABLE_PAD;
}

function clip(text: string, maxPx: number, fontSize: number): string {
  const charW = fontSize * 0.62;
  const max = Math.floor(maxPx / charW);
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)) + "…";
}

function autoLayout(tables: SchemaTable[]): Map<string, Pos> {
  const positions = new Map<string, Pos>();
  const cols = Math.ceil(Math.sqrt(tables.length));
  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const maxH = Math.max(
      ...tables.slice(row * cols, (row + 1) * cols).map((tb) => tableHeight(tb)),
      150
    );
    positions.set(t.name, {
      x: col * (TABLE_W + GRID_GAP) + GRID_GAP,
      y: row * (maxH + GRID_GAP) + GRID_GAP,
    });
  });
  return positions;
}

type FKLine = {
  from: Pos;
  to: Pos;
  fromTable: string;
  toTable: string;
};

function computeLines(tables: SchemaTable[], positions: Map<string, Pos>): FKLine[] {
  const lines: FKLine[] = [];
  for (const table of tables) {
    const pos = positions.get(table.name);
    if (!pos) continue;
    table.columns.forEach((col, ci) => {
      if (!col.foreign_key) return;
      const refPos = positions.get(col.foreign_key.ref_table);
      if (!refPos) return;
      const refTable = tables.find((t) => t.name === col.foreign_key!.ref_table);
      if (!refTable) return;
      const refColIdx = refTable.columns.findIndex(
        (c) => c.name === col.foreign_key!.ref_column
      );
      const fromY = pos.y + HEADER_H + ci * COL_H + COL_H / 2;
      const toY =
        refPos.y + HEADER_H + (refColIdx >= 0 ? refColIdx : 0) * COL_H + COL_H / 2;

      const fromRight = pos.x + TABLE_W;
      const toLeft = refPos.x;
      const fromLeft = pos.x;
      const toRight = refPos.x + TABLE_W;

      if (Math.abs(fromRight - toLeft) < Math.abs(fromLeft - toRight)) {
        lines.push({
          from: { x: fromRight, y: fromY },
          to: { x: toLeft, y: toY },
          fromTable: table.name,
          toTable: col.foreign_key.ref_table,
        });
      } else {
        lines.push({
          from: { x: fromLeft, y: fromY },
          to: { x: toRight, y: toY },
          fromTable: table.name,
          toTable: col.foreign_key.ref_table,
        });
      }
    });
  }
  return lines;
}

function getBounds(tables: SchemaTable[], positions: Map<string, Pos>) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const t of tables) {
    const pos = positions.get(t.name);
    if (!pos) continue;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + TABLE_W);
    maxY = Math.max(maxY, pos.y + tableHeight(t));
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export default function SchemaView() {
  const { selectedDb } = useNavigationStore();

  const { data: schema, isLoading } = useQuery<SchemaTable[]>({
    queryKey: ["schema", selectedDb],
    queryFn: () => databaseRequest.getSchema(selectedDb!),
    enabled: !!selectedDb,
  });

  const [positions, setPositions] = useState<Map<string, Pos>>(new Map());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Pos>({ x: 0, y: 0 });
  const [pan, setPan] = useState<Pos>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Pos>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 600 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSvgSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (schema && schema.length > 0) {
      const id = requestAnimationFrame(() => {
        setPositions(autoLayout(schema));
        setPan({ x: 0, y: 0 });
        setZoom(1);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [schema]);

  const lines = useMemo(
    () => (schema ? computeLines(schema, positions) : []),
    [schema, positions]
  );

  const bounds = useMemo(
    () => (schema && schema.length > 0 ? getBounds(schema, positions) : null),
    [schema, positions]
  );

  const connectedTables = useMemo(() => {
    if (!hoveredTable) return new Set<string>();
    const s = new Set<string>([hoveredTable]);
    for (const l of lines) {
      if (l.fromTable === hoveredTable) s.add(l.toTable);
      if (l.toTable === hoveredTable) s.add(l.fromTable);
    }
    return s;
  }, [hoveredTable, lines]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tableName: string) => {
      e.stopPropagation();
      const pos = positions.get(tableName);
      if (!pos) return;
      setDragging(tableName);
      setDragOffset({
        x: (e.clientX - pan.x) / zoom - pos.x,
        y: (e.clientY - pan.y) / zoom - pos.y,
      });
    },
    [positions, zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) {
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(dragging, {
            x: (e.clientX - pan.x) / zoom - dragOffset.x,
            y: (e.clientY - pan.y) / zoom - dragOffset.y,
          });
          return next;
        });
      } else if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [dragging, dragOffset, zoom, pan, isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
  }, []);

  const handleBgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === svgRef.current || (e.target as SVGElement).tagName === "svg") {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [pan]
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  const resetView = useCallback(() => {
    if (schema) {
      setPositions(autoLayout(schema));
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [schema]);

  const fitToScreen = useCallback(() => {
    if (!bounds) return;
    const pad = 60;
    const scaleX = (svgSize.width - pad * 2) / bounds.width;
    const scaleY = (svgSize.height - pad * 2) / bounds.height;
    const newZoom = Math.min(scaleX, scaleY, 2);
    setPan({
      x: svgSize.width / 2 - ((bounds.minX + bounds.maxX) / 2) * newZoom,
      y: svgSize.height / 2 - ((bounds.minY + bounds.maxY) / 2) * newZoom,
    });
    setZoom(newZoom);
  }, [bounds, svgSize]);

  const minimap = useMemo(() => {
    if (!bounds || !schema) return null;
    const bx = bounds.minX - 20;
    const by = bounds.minY - 20;
    const bw = bounds.width + 40;
    const bh = bounds.height + 40;
    if (bw <= 0 || bh <= 0) return null;
    const scale = Math.min(
      (MINIMAP_W - MINIMAP_PAD * 2) / bw,
      (MINIMAP_H - MINIMAP_PAD * 2) / bh
    );
    const ox = (MINIMAP_W - bw * scale) / 2;
    const oy = (MINIMAP_H - bh * scale) / 2;
    return { bx, by, bw, bh, scale, ox, oy };
  }, [bounds, schema]);

  const handleMinimapClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!minimap) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = (mx - minimap.ox) / minimap.scale + minimap.bx;
      const cy = (my - minimap.oy) / minimap.scale + minimap.by;
      setPan({
        x: svgSize.width / 2 - cx * zoom,
        y: svgSize.height / 2 - cy * zoom,
      });
    },
    [minimap, svgSize, zoom]
  );

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!schema || schema.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No tables found in {selectedDb}
      </div>
    );
  }

  const vpRect = minimap
    ? {
        x: (-pan.x / zoom - minimap.bx) * minimap.scale + minimap.ox,
        y: (-pan.y / zoom - minimap.by) * minimap.scale + minimap.oy,
        w: (svgSize.width / zoom) * minimap.scale,
        h: (svgSize.height / zoom) * minimap.scale,
      }
    : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2 text-xs">
        <span className="font-semibold text-sm text-foreground">Schema</span>
        <span className="text-muted-foreground">
          {selectedDb} · {schema.length} tables · {lines.length} relations
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setZoom((z) => Math.min(2, z + 0.2))}>
            +
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}>
            −
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={fitToScreen}>
            Fit
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={resetView}>
            Reset
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 bg-muted/20 relative">
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full select-none"
          style={{ cursor: isPanning ? "grabbing" : dragging ? "move" : "grab" }}
          onMouseDown={handleBgMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-border" />
            </pattern>
            <marker id="fk-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary/60" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <rect width="10000" height="10000" x="-5000" y="-5000" fill="url(#grid)" className="pointer-events-none" />

            {/* FK lines with cardinality labels */}
            {lines.map((line, i) => {
              const dx = line.to.x - line.from.x;
              const cx = Math.abs(dx) * 0.4 + 30;
              const path = `M ${line.from.x} ${line.from.y} C ${line.from.x + (dx > 0 ? cx : -cx)} ${line.from.y}, ${line.to.x + (dx > 0 ? -cx : cx)} ${line.to.y}, ${line.to.x} ${line.to.y}`;
              const highlighted = hoveredTable !== null && (line.fromTable === hoveredTable || line.toTable === hoveredTable);
              const dimmed = hoveredTable !== null && !highlighted;
              const nDir = dx > 0 ? 1 : -1;

              return (
                <g key={i} style={{ opacity: dimmed ? 0.06 : 1, transition: "opacity 150ms" }}>
                  <path
                    d={path}
                    fill="none"
                    strokeWidth={highlighted ? 2.5 : 1.5}
                    className={highlighted ? "stroke-primary" : "stroke-primary/40"}
                    markerEnd="url(#fk-arrow)"
                  />
                  <text
                    x={line.from.x + nDir * 16}
                    y={line.from.y - 7}
                    textAnchor="middle"
                    className={highlighted ? "fill-primary" : "fill-primary/50"}
                    style={{ fontSize: 10, fontWeight: 700 }}
                  >
                    N
                  </text>
                  <text
                    x={line.to.x - nDir * 16}
                    y={line.to.y - 7}
                    textAnchor="middle"
                    className={highlighted ? "fill-primary" : "fill-primary/50"}
                    style={{ fontSize: 10, fontWeight: 700 }}
                  >
                    1
                  </text>
                </g>
              );
            })}

            {/* Tables */}
            {schema.map((table, ti) => {
              const pos = positions.get(table.name);
              if (!pos) return null;
              const h = tableHeight(table);
              const isConnected = connectedTables.has(table.name);
              const dimmed = hoveredTable !== null && !isConnected;
              const isHovered = hoveredTable === table.name;
              const headerName = clip(table.name, TABLE_W - 72, 12);

              return (
                <g
                  key={table.name}
                  transform={`translate(${pos.x},${pos.y})`}
                  onMouseDown={(e) => handleMouseDown(e, table.name)}
                  onMouseEnter={() => setHoveredTable(table.name)}
                  onMouseLeave={() => setHoveredTable(null)}
                  style={{ cursor: "move", opacity: dimmed ? 0.2 : 1, transition: "opacity 150ms" }}
                >
                  <defs>
                    <clipPath id={`sc-${ti}`}>
                      <rect width={TABLE_W} height={h} rx={6} />
                    </clipPath>
                  </defs>

                  <rect width={TABLE_W} height={h} rx={6} fill="black" fillOpacity={isHovered ? 0.15 : 0.1} x="2" y="2" />
                  <rect width={TABLE_W} height={h} rx={6} className="fill-card" />

                  <g clipPath={`url(#sc-${ti})`}>
                    <rect width={TABLE_W} height={HEADER_H} rx={6} className="fill-primary/10" />
                    <rect width={TABLE_W} height={HEADER_H / 2} y={HEADER_H / 2} className="fill-primary/10" />
                    <text x={12} y={HEADER_H / 2 + 5} className="fill-foreground" style={{ fontSize: 12, fontWeight: 600 }}>
                      {headerName !== table.name && <title>{table.name}</title>}
                      {headerName}
                    </text>
                    <text x={TABLE_W - 12} y={HEADER_H / 2 + 4} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>
                      {table.columns.length} cols
                    </text>

                    {table.columns.map((col, ci) => {
                      const cy = HEADER_H + ci * COL_H;
                      const hasIcon = col.is_primary || !!col.foreign_key;
                      const nameX = hasIcon ? 24 : 12;
                      const nameMax = TABLE_W * 0.52 - nameX;
                      const typeMax = TABLE_W * 0.38;
                      const colName = clip(col.name, nameMax, 11);
                      const fullType = col.type + (col.nullable ? "?" : "");
                      const colType = clip(fullType, typeMax, 10);
                      const tooltip = `${col.name}: ${col.type}${col.nullable ? " (nullable)" : ""}${col.is_primary ? " [PK]" : ""}${col.foreign_key ? ` → ${col.foreign_key.ref_table}.${col.foreign_key.ref_column}` : ""}`;

                      return (
                        <g key={col.name}>
                          <title>{tooltip}</title>
                          {ci > 0 && (
                            <line x1={0} y1={cy} x2={TABLE_W} y2={cy} className="stroke-border" strokeWidth="0.5" />
                          )}
                          {col.is_primary && (
                            <text x={8} y={cy + COL_H / 2 + 4} style={{ fontSize: 9 }} className="fill-amber-500">
                              🔑
                            </text>
                          )}
                          {col.foreign_key && !col.is_primary && (
                            <text x={8} y={cy + COL_H / 2 + 4} style={{ fontSize: 9 }} className="fill-primary/60">
                              →
                            </text>
                          )}
                          <text x={nameX} y={cy + COL_H / 2 + 4} className="fill-foreground" style={{ fontSize: 11 }}>
                            {colName}
                          </text>
                          <text x={TABLE_W - 8} y={cy + COL_H / 2 + 4} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                            {colType}
                          </text>
                        </g>
                      );
                    })}
                  </g>

                  <rect
                    width={TABLE_W}
                    height={h}
                    rx={6}
                    fill="none"
                    className={isHovered ? "stroke-primary" : "stroke-border"}
                    strokeWidth={isHovered ? 2 : 1}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Minimap */}
        {minimap && schema.length > 1 && (
          <svg
            width={MINIMAP_W}
            height={MINIMAP_H}
            className="absolute bottom-3 right-3 rounded-lg border border-border cursor-crosshair"
            style={{ background: "var(--card)", opacity: 0.92 }}
            onClick={handleMinimapClick}
          >
            <g transform={`translate(${minimap.ox},${minimap.oy}) scale(${minimap.scale})`}>
              <g transform={`translate(${-minimap.bx},${-minimap.by})`}>
                {lines.map((line, i) => (
                  <line
                    key={i}
                    x1={line.from.x}
                    y1={line.from.y}
                    x2={line.to.x}
                    y2={line.to.y}
                    className="stroke-primary/30"
                    strokeWidth={1 / minimap.scale}
                  />
                ))}
                {schema.map((table) => {
                  const pos = positions.get(table.name);
                  if (!pos) return null;
                  const isH = hoveredTable === table.name;
                  const isC = connectedTables.has(table.name);
                  return (
                    <rect
                      key={table.name}
                      x={pos.x}
                      y={pos.y}
                      width={TABLE_W}
                      height={tableHeight(table)}
                      rx={2 / minimap.scale}
                      className={isH ? "fill-primary/60" : isC ? "fill-primary/30" : "fill-muted-foreground/20"}
                      stroke="var(--border)"
                      strokeWidth={0.5 / minimap.scale}
                    />
                  );
                })}
              </g>
            </g>
            {vpRect && (
              <rect
                x={vpRect.x}
                y={vpRect.y}
                width={vpRect.w}
                height={vpRect.h}
                fill="var(--primary)"
                fillOpacity={0.08}
                stroke="var(--primary)"
                strokeWidth={1.5}
                rx={2}
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
