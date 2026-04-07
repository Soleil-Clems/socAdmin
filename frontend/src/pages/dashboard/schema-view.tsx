import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { databaseRequest, type SchemaTable } from "@/requests/database.request";
import { useNavigationStore } from "@/stores/navigation.store";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// ── Layout constants ──
const TABLE_W = 220;
const COL_H = 24;
const HEADER_H = 32;
const TABLE_PAD = 8;
const GRID_GAP = 40;

type Pos = { x: number; y: number };

function tableHeight(t: SchemaTable) {
  return HEADER_H + t.columns.length * COL_H + TABLE_PAD;
}

// Auto-layout: arrange tables in a grid
function autoLayout(tables: SchemaTable[]): Map<string, Pos> {
  const positions = new Map<string, Pos>();
  const cols = Math.ceil(Math.sqrt(tables.length));
  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Estimate max height per row for spacing
    const maxH = Math.max(
      ...tables
        .slice(row * cols, (row + 1) * cols)
        .map((tb) => tableHeight(tb)),
      150
    );
    positions.set(t.name, {
      x: col * (TABLE_W + GRID_GAP) + GRID_GAP,
      y: row * (maxH + GRID_GAP) + GRID_GAP,
    });
  });
  return positions;
}

// Compute FK lines
type FKLine = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  fromTable: string;
  toTable: string;
};

function computeLines(
  tables: SchemaTable[],
  positions: Map<string, Pos>
): FKLine[] {
  const lines: FKLine[] = [];
  for (const table of tables) {
    const pos = positions.get(table.name);
    if (!pos) continue;
    table.columns.forEach((col, ci) => {
      if (!col.foreign_key) return;
      const refPos = positions.get(col.foreign_key.ref_table);
      if (!refPos) return;
      const refTable = tables.find(
        (t) => t.name === col.foreign_key!.ref_table
      );
      if (!refTable) return;
      const refColIdx = refTable.columns.findIndex(
        (c) => c.name === col.foreign_key!.ref_column
      );
      const fromY = pos.y + HEADER_H + ci * COL_H + COL_H / 2;
      const toY =
        refPos.y +
        HEADER_H +
        (refColIdx >= 0 ? refColIdx : 0) * COL_H +
        COL_H / 2;

      // Connect from right side of source to left side of target (or vice versa)
      const fromRight = pos.x + TABLE_W;
      const toLeft = refPos.x;
      const fromLeft = pos.x;
      const toRight = refPos.x + TABLE_W;

      // Pick the shortest path
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
  const svgRef = useRef<SVGSVGElement>(null);

  // Auto-layout when schema loads
  useEffect(() => {
    if (schema && schema.length > 0) {
      setPositions(autoLayout(schema));
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [schema]);

  const lines = useMemo(
    () => (schema ? computeLines(schema, positions) : []),
    [schema, positions]
  );

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tableName: string) => {
      e.stopPropagation();
      const pos = positions.get(tableName);
      if (!pos) return;
      setDragging(tableName);
      setDragOffset({
        x: e.clientX / zoom - pos.x,
        y: e.clientY / zoom - pos.y,
      });
    },
    [positions, zoom]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) {
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(dragging, {
            x: e.clientX / zoom - dragOffset.x,
            y: e.clientY / zoom - dragOffset.y,
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
    [dragging, dragOffset, zoom, isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
  }, []);

  // Pan on background drag
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

  const resetView = () => {
    if (schema) {
      setPositions(autoLayout(schema));
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  };

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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            +
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
          >
            −
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={resetView}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-muted/20 relative">
        <svg
          ref={svgRef}
          className="w-full h-full select-none"
          style={{ cursor: isPanning ? "grabbing" : dragging ? "move" : "grab" }}
          onMouseDown={handleBgMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Grid pattern */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.3"
                className="text-border"
              />
            </pattern>
            <marker
              id="fk-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary/60" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <rect
              width="10000"
              height="10000"
              x="-5000"
              y="-5000"
              fill="url(#grid)"
              className="pointer-events-none"
            />

            {/* FK lines */}
            {lines.map((line, i) => {
              const dx = line.to.x - line.from.x;
              const cx = Math.abs(dx) * 0.4 + 30;
              const path = `M ${line.from.x} ${line.from.y} C ${line.from.x + (dx > 0 ? cx : -cx)} ${line.from.y}, ${line.to.x + (dx > 0 ? -cx : cx)} ${line.to.y}, ${line.to.x} ${line.to.y}`;
              return (
                <path
                  key={i}
                  d={path}
                  fill="none"
                  strokeWidth="1.5"
                  className="stroke-primary/40"
                  markerEnd="url(#fk-arrow)"
                />
              );
            })}

            {/* Tables */}
            {schema.map((table) => {
              const pos = positions.get(table.name);
              if (!pos) return null;
              const h = tableHeight(table);
              return (
                <g
                  key={table.name}
                  transform={`translate(${pos.x},${pos.y})`}
                  onMouseDown={(e) => handleMouseDown(e, table.name)}
                  style={{ cursor: "move" }}
                >
                  {/* Shadow */}
                  <rect
                    width={TABLE_W}
                    height={h}
                    rx="6"
                    fill="black"
                    fillOpacity="0.1"
                    x="2"
                    y="2"
                  />
                  {/* Card */}
                  <rect
                    width={TABLE_W}
                    height={h}
                    rx="6"
                    className="fill-card stroke-border"
                    strokeWidth="1"
                  />
                  {/* Header */}
                  <rect
                    width={TABLE_W}
                    height={HEADER_H}
                    rx="6"
                    className="fill-primary/10"
                  />
                  <rect
                    width={TABLE_W}
                    height={HEADER_H / 2}
                    y={HEADER_H / 2}
                    className="fill-primary/10"
                  />
                  <text
                    x={12}
                    y={HEADER_H / 2 + 5}
                    className="fill-foreground text-[12px] font-semibold"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {table.name}
                  </text>
                  <text
                    x={TABLE_W - 12}
                    y={HEADER_H / 2 + 4}
                    textAnchor="end"
                    className="fill-muted-foreground"
                    style={{ fontSize: 9 }}
                  >
                    {table.columns.length} cols
                  </text>

                  {/* Columns */}
                  {table.columns.map((col, ci) => {
                    const cy = HEADER_H + ci * COL_H;
                    return (
                      <g key={col.name}>
                        {ci > 0 && (
                          <line
                            x1={0}
                            y1={cy}
                            x2={TABLE_W}
                            y2={cy}
                            className="stroke-border"
                            strokeWidth="0.5"
                          />
                        )}
                        {/* PK icon */}
                        {col.is_primary && (
                          <text
                            x={8}
                            y={cy + COL_H / 2 + 4}
                            style={{ fontSize: 9 }}
                            className="fill-amber-500"
                          >
                            🔑
                          </text>
                        )}
                        {/* FK icon */}
                        {col.foreign_key && !col.is_primary && (
                          <text
                            x={8}
                            y={cy + COL_H / 2 + 4}
                            style={{ fontSize: 9 }}
                            className="fill-primary/60"
                          >
                            →
                          </text>
                        )}
                        <text
                          x={col.is_primary || col.foreign_key ? 24 : 12}
                          y={cy + COL_H / 2 + 4}
                          className="fill-foreground"
                          style={{ fontSize: 11 }}
                        >
                          {col.name}
                        </text>
                        <text
                          x={TABLE_W - 8}
                          y={cy + COL_H / 2 + 4}
                          textAnchor="end"
                          className="fill-muted-foreground"
                          style={{ fontSize: 10 }}
                        >
                          {col.type}
                          {col.nullable ? "?" : ""}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
