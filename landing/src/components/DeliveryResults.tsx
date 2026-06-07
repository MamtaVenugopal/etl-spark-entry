import { useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Loader2, XCircle } from "lucide-react";
import { fetchArtifactBlob, fetchProfileHtml } from "@/lib/api";
import type { ChartProfile, ResultPreview } from "@/lib/types";

type EvalEntry = { passed?: boolean; summary?: string };

type Props = {
  runId: string;
  preview?: ResultPreview;
  chartProfile?: ChartProfile;
  complete: boolean;
  hasReportPdf: boolean;
  hasProfileHtml: boolean;
  evaluations?: Record<string, EvalEntry>;
  testFiles?: Array<{ path?: string }>;
  prUrl?: string;
  deliveryPhase?: string;
};

function cellValue(
  row: Record<string, unknown> | unknown[],
  col: string,
  columns: string[],
): unknown {
  if (Array.isArray(row)) return row[columns.indexOf(col)];
  return (row as Record<string, unknown>)[col];
}

function pickChartColumns(preview: ResultPreview): { label: string; value: string } | null {
  const rows = preview.rows ?? [];
  if (rows.length === 0) return null;

  const columns =
    preview.columns ??
    (Array.isArray(rows[0])
      ? rows[0].map((_, i) => `col_${i}`)
      : Object.keys(rows[0] as Record<string, unknown>));

  const isNumericCol = (col: string) =>
    rows.some((row) => {
      const v = cellValue(row, col, columns);
      if (v == null || v === "") return false;
      const n = typeof v === "number" ? v : Number(v);
      return !Number.isNaN(n);
    }) &&
    rows.every((row) => {
      const v = cellValue(row, col, columns);
      if (v == null || v === "") return true;
      const n = typeof v === "number" ? v : Number(v);
      return !Number.isNaN(n);
    });

  const valueCol = columns.find(isNumericCol);
  const labelCol =
    columns.find((c) => c !== valueCol && !isNumericCol(c)) ??
    columns.find((c) => c !== valueCol);

  if (!labelCol || !valueCol) return null;
  return { label: labelCol, value: valueCol };
}

function PhaseBadge({ label, ev }: { label: string; ev?: EvalEntry }) {
  if (!ev) {
    return (
      <div className="rounded-md border border-white/10 bg-background/30 px-3 py-2 text-xs text-muted-foreground">
        {label}: pending
      </div>
    );
  }
  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${
        ev.passed
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
          : "border-red-500/30 bg-red-500/10 text-red-100"
      }`}
    >
      {ev.passed ? (
        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      )}
      <div>
        <div className="font-semibold">{label}</div>
        {ev.summary && <div className="text-[11px] opacity-90 mt-0.5">{ev.summary}</div>}
      </div>
    </div>
  );
}

function ResultsTable({ preview, complete }: { preview?: ResultPreview; complete: boolean }) {
  const rows = preview?.rows ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {complete
          ? "Run complete. No sample preview returned."
          : "Business results appear when Agent 4 delivery finishes."}
      </p>
    );
  }

  const columns =
    preview?.columns ??
    (Array.isArray(rows[0])
      ? rows[0].map((_, i) => `col_${i}`)
      : Object.keys(rows[0] as Record<string, unknown>));

  return (
    <div className="rounded-lg border border-white/10 overflow-x-auto">
      <table className="w-full text-left text-xs font-mono">
        <thead className="bg-background/50 border-b border-white/10">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-semibold text-agent-cyan whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0">
              {columns.map((c) => {
                const v = cellValue(row, c, columns);
                const display =
                  typeof v === "number"
                    ? v.toLocaleString(undefined, { maximumFractionDigits: 4 })
                    : v == null
                      ? ""
                      : String(v);
                return (
                  <td key={c} className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function humanizeColumn(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function axisTitle(profile: ChartProfile, axis: "x" | "y" | "z"): string {
  if (axis === "x" && profile.x_axis_label) return profile.x_axis_label;
  if (axis === "y" && profile.y_axis_label) return profile.y_axis_label;
  if (axis === "z" && profile.z_axis_label) return profile.z_axis_label;
  if (axis === "y") return humanizeColumn(profile.value_column);
  if (axis === "z" && profile.series_column) return humanizeColumn(profile.series_column);
  if (
    profile.label_column === "year_month" ||
    profile.label_column === "order_year_month"
  ) {
    return "Period";
  }
  if (profile.label_column === "year_quarter") return "Quarter";
  return humanizeColumn(profile.label_column);
}

const SERIES_COLORS = [
  "#22d3ee",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#f87171",
  "#60a5fa",
];

type Bar3DPoint = {
  period: string;
  series: string;
  value: number;
  sortKey: string;
  periodIdx: number;
  seriesIdx: number;
};

function isoProject(
  x: number,
  y: number,
  z: number,
  origin: { x: number; y: number },
  scale: { x: number; y: number; z: number },
): { x: number; y: number } {
  const isoX = 0.866;
  const isoZ = 0.5;
  return {
    x: origin.x + (x * scale.x - z * scale.z) * isoX,
    y: origin.y - y * scale.y + (x * scale.x + z * scale.z) * isoZ,
  };
}

function Surface3DChart({
  preview,
  profile,
}: {
  preview: ResultPreview;
  profile: ChartProfile;
}) {
  const rows = preview.rows ?? [];
  const columns = preview.columns ?? [];
  if (rows.length === 0 || !profile.series_column) return null;

  const labelCols =
    profile.label_columns ??
    (profile.label_column === "order_year_month"
      ? ["order_year", "order_month"]
      : ["year", "month"]);

  const buildPeriod = (row: Record<string, unknown> | unknown[]) => {
    const y = cellValue(row, labelCols[0], columns);
    const m = cellValue(row, labelCols[1], columns);
    if (y != null && m != null) {
      return `${Math.trunc(Number(y))}-${String(Math.trunc(Number(m))).padStart(2, "0")}`;
    }
    return "unknown";
  };

  const buildSortKey = (row: Record<string, unknown> | unknown[]) => {
    const y = cellValue(row, labelCols[0], columns);
    const m = cellValue(row, labelCols[1], columns);
    if (y != null && m != null) {
      return `${String(Math.trunc(Number(y))).padStart(4, "0")}-${String(Math.trunc(Number(m))).padStart(2, "0")}`;
    }
    return buildPeriod(row);
  };

  const rawPoints: Bar3DPoint[] = rows.map((row) => {
    const period = buildPeriod(row);
    const series = String(cellValue(row, profile.series_column!, columns) ?? "unknown");
    const raw = cellValue(row, profile.value_column, columns);
    const value = typeof raw === "number" ? raw : Number(raw);
    return {
      period,
      series,
      value: Number.isNaN(value) ? 0 : value,
      sortKey: buildSortKey(row),
      periodIdx: 0,
      seriesIdx: 0,
    };
  });

  const periods = [...new Set(rawPoints.map((p) => p.period))].sort((a, b) => {
    const ka = rawPoints.find((p) => p.period === a)?.sortKey ?? a;
    const kb = rawPoints.find((p) => p.period === b)?.sortKey ?? b;
    return ka.localeCompare(kb);
  });
  const seriesList = [...new Set(rawPoints.map((p) => p.series))].sort();

  const periodIndex = new Map(periods.map((p, i) => [p, i]));
  const seriesIndex = new Map(seriesList.map((s, i) => [s, i]));

  const points = rawPoints
    .map((p) => ({
      ...p,
      periodIdx: periodIndex.get(p.period) ?? 0,
      seriesIdx: seriesIndex.get(p.series) ?? 0,
    }))
    .slice(0, 120);

  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const width = 640;
  const height = 360;
  const margin = { top: 28, right: 140, bottom: 48, left: 72 };
  const origin = { x: margin.left + 20, y: height - margin.bottom - 10 };
  const scale = { x: 14, y: (height - margin.top - margin.bottom - 40) / maxValue, z: 18 };

  const seriesColor = (series: string) =>
    SERIES_COLORS[seriesIndex.get(series)! % SERIES_COLORS.length];

  const barWidth = 10;
  const barDepth = 8;

  const bars = points.map((p) => {
    const base = isoProject(p.periodIdx * 1.2, 0, p.seriesIdx * 1.1, origin, scale);
    const topFront = isoProject(p.periodIdx * 1.2, p.value, p.seriesIdx * 1.1, origin, scale);
    const topBack = isoProject(
      p.periodIdx * 1.2 + barWidth / scale.x,
      p.value,
      p.seriesIdx * 1.1 + barDepth / scale.z,
      origin,
      scale,
    );
    const baseBack = isoProject(
      p.periodIdx * 1.2 + barWidth / scale.x,
      0,
      p.seriesIdx * 1.1 + barDepth / scale.z,
      origin,
      scale,
    );
    const baseSide = isoProject(
      p.periodIdx * 1.2 + barWidth / scale.x,
      0,
      p.seriesIdx * 1.1,
      origin,
      scale,
    );
    const topSide = isoProject(
      p.periodIdx * 1.2 + barWidth / scale.x,
      p.value,
      p.seriesIdx * 1.1,
      origin,
      scale,
    );
    return { ...p, base, topFront, topBack, baseBack, baseSide, topSide, color: seriesColor(p.series) };
  });

  const xEnd = isoProject(Math.max(periods.length - 1, 1) * 1.2 + 1, 0, 0, origin, scale);
  const zEnd = isoProject(0, 0, Math.max(seriesList.length - 1, 1) * 1.1 + 0.8, origin, scale);
  const yEnd = isoProject(0, maxValue * 1.05, 0, origin, scale);

  const xTitle = axisTitle(profile, "x");
  const yTitle = axisTitle(profile, "y");
  const zTitle = axisTitle(profile, "z");

  return (
    <div className="rounded-lg border border-white/10 bg-background/20 p-4 space-y-3">
      <p className="font-mono text-xs tracking-widest text-muted-foreground">
        CHART · 3D · {profile.title}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-3xl h-auto"
        role="img"
        aria-label={`${profile.title} 3D chart`}
      >
        {/* Y axis */}
        <line
          x1={origin.x}
          y1={origin.y}
          x2={yEnd.x}
          y2={yEnd.y}
          stroke="rgba(255,255,255,0.35)"
        />
        <text
          x={yEnd.x - 8}
          y={yEnd.y - 6}
          fill="rgba(255,255,255,0.7)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          {yTitle}
        </text>
        {/* X axis (period) */}
        <line
          x1={origin.x}
          y1={origin.y}
          x2={xEnd.x}
          y2={xEnd.y}
          stroke="rgba(255,255,255,0.35)"
        />
        <text
          x={xEnd.x - 20}
          y={xEnd.y + 18}
          fill="rgba(255,255,255,0.7)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          {xTitle}
        </text>
        {/* Z axis (payment type depth) */}
        <line
          x1={origin.x}
          y1={origin.y}
          x2={zEnd.x}
          y2={zEnd.y}
          stroke="rgba(255,255,255,0.35)"
        />
        <text
          x={zEnd.x - 40}
          y={zEnd.y + 14}
          fill="rgba(255,255,255,0.7)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          {zTitle}
        </text>

        {bars.map((b, i) => (
          <g key={`${b.period}-${b.series}-${i}`}>
            <polygon
              points={`${b.base.x},${b.base.y} ${b.baseSide.x},${b.baseSide.y} ${b.baseBack.x},${b.baseBack.y} ${b.topBack.x},${b.topBack.y} ${b.topSide.x},${b.topSide.y} ${b.topFront.x},${b.topFront.y}`}
              fill={b.color}
              fillOpacity="0.35"
              stroke={b.color}
              strokeWidth="0.5"
            />
            <polygon
              points={`${b.base.x},${b.base.y} ${b.topFront.x},${b.topFront.y} ${b.topSide.x},${b.topSide.y} ${b.baseSide.x},${b.baseSide.y}`}
              fill={b.color}
              fillOpacity="0.85"
            />
            <polygon
              points={`${b.topFront.x},${b.topFront.y} ${b.topBack.x},${b.topBack.y} ${b.topSide.x},${b.topSide.y}`}
              fill={b.color}
              fillOpacity="0.65"
            />
          </g>
        ))}

        {/* Period tick labels (sparse) */}
        {periods.map((period, idx) => {
          if (idx % 3 !== 0 && idx !== periods.length - 1) return null;
          const tick = isoProject(idx * 1.2, 0, -0.3, origin, scale);
          return (
            <text
              key={period}
              x={tick.x}
              y={tick.y + 16}
              textAnchor="middle"
              fill="rgba(255,255,255,0.5)"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
            >
              {period}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-full">
          Legend · Payment Type
        </span>
        {seriesList.map((series) => (
          <div key={series} className="flex items-center gap-2 text-xs font-mono">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: seriesColor(series) }}
            />
            <span className="text-muted-foreground">{series}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatAxisValue(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}k`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return [min - pad, min, min + pad].sort((a, b) => a - b);
  }
  const span = max - min;
  const step = span / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i += 1) {
    ticks.push(min + step * i);
  }
  return ticks.sort((a, b) => a - b);
}

function buildYAxis(values: number[]): { min: number; max: number; ticks: number[] } {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  let min = Math.min(0, dataMin);
  let max = dataMax <= 0 ? 1 : dataMax * 1.06;
  if (dataMin === dataMax) {
    min = Math.min(0, dataMin * 0.85);
    max = dataMax * 1.15 || 1;
  }
  const ticks = niceTicks(min, max, 5);
  return {
    min: ticks[0],
    max: ticks[ticks.length - 1],
    ticks,
  };
}

function isTimeSeriesProfile(profile: ChartProfile): boolean {
  return (
    profile.time_series === true ||
    profile.label_column === "year_month" ||
    profile.label_column === "order_year_month" ||
    profile.label_column === "year_quarter"
  );
}

function sortChartPoints(
  points: Array<{ label: string; value: number; sortKey?: string }>,
  profile: ChartProfile,
): Array<{ label: string; value: number; sortKey?: string }> {
  if (profile.chart_type === "line" || isTimeSeriesProfile(profile)) {
    return [...points].sort((a, b) =>
      (a.sortKey ?? a.label).localeCompare(b.sortKey ?? b.label),
    );
  }
  if (profile.chart_type === "horizontal_bar") {
    return [...points].sort((a, b) => b.value - a.value);
  }
  return [...points].sort((a, b) =>
    (a.sortKey ?? a.label).localeCompare(b.sortKey ?? b.label),
  );
}

function LineChartWithAxes({
  points,
  profile,
}: {
  points: Array<{ label: string; value: number }>;
  profile: ChartProfile;
}) {
  const width = 520;
  const height = 260;
  const margin = { top: 20, right: 20, bottom: 56, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const { min, max, ticks: yTicks } = buildYAxis(points.map((p) => p.value));
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x =
      margin.left +
      (i / Math.max(points.length - 1, 1)) * plotW;
    const y =
      margin.top +
      plotH -
      ((p.value - min) / range) * plotH;
    return { x, y, ...p };
  });

  const xLabelStep = Math.max(1, Math.ceil(points.length / 8));
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const xTitle = axisTitle(profile, "x");
  const yTitle = axisTitle(profile, "y");

  return (
    <div className="rounded-lg border border-white/10 bg-background/20 p-4 space-y-2">
      <p className="font-mono text-xs tracking-widest text-muted-foreground">
        CHART · {profile.title}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-2xl h-auto"
        role="img"
        aria-label={`${profile.title} line chart`}
      >
        {/* Y axis line */}
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + plotH}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
        />
        {/* X axis line */}
        <line
          x1={margin.left}
          y1={margin.top + plotH}
          x2={margin.left + plotW}
          y2={margin.top + plotH}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
        />

        {/* Y grid + tick labels */}
        {yTicks.map((tick, tickIdx) => {
          const y =
            margin.top +
            plotH -
            ((tick - min) / range) * plotH;
          return (
            <g key={`y-${tickIdx}-${tick}`}>
              <line
                x1={margin.left}
                y1={y}
                x2={margin.left + plotW}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <text
                x={margin.left - 8}
                y={y + 4}
                textAnchor="end"
                fill="rgba(255,255,255,0.55)"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {formatAxisValue(tick)}
              </text>
            </g>
          );
        })}

        {/* Y axis title */}
        <text
          x={14}
          y={margin.top + plotH / 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.65)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          transform={`rotate(-90 14 ${margin.top + plotH / 2})`}
        >
          {yTitle}
        </text>

        {/* Data line */}
        <polyline
          fill="none"
          stroke="#34d399"
          strokeWidth="2.5"
          points={polyline}
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3.5" fill="#22d3ee" />
        ))}

        {/* X tick labels */}
        {coords.map((c, i) =>
          i % xLabelStep === 0 || i === coords.length - 1 ? (
            <text
              key={`x-${i}`}
              x={c.x}
              y={margin.top + plotH + 14}
              textAnchor="end"
              fill="rgba(255,255,255,0.55)"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
              transform={`rotate(-35 ${c.x} ${margin.top + plotH + 14})`}
            >
              {c.label}
            </text>
          ) : null,
        )}

        {/* X axis title */}
        <text
          x={margin.left + plotW / 2}
          y={height - 8}
          textAnchor="middle"
          fill="rgba(255,255,255,0.65)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          {xTitle}
        </text>
      </svg>
    </div>
  );
}

function VerticalBarChartWithAxes({
  points,
  profile,
}: {
  points: Array<{ label: string; value: number }>;
  profile: ChartProfile;
}) {
  const width = 520;
  const height = 260;
  const margin = { top: 20, right: 20, bottom: 72, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const { min, max, ticks: yTicks } = buildYAxis(points.map((p) => p.value));
  const range = max - min || 1;
  const barW = Math.max(8, plotW / Math.max(points.length, 1) - 4);
  const xTitle = axisTitle(profile, "x");
  const yTitle = axisTitle(profile, "y");

  return (
    <div className="rounded-lg border border-white/10 bg-background/20 p-4 space-y-2">
      <p className="font-mono text-xs tracking-widest text-muted-foreground">
        CHART · {profile.title}
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl h-auto" role="img">
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + plotH}
          stroke="rgba(255,255,255,0.25)"
        />
        <line
          x1={margin.left}
          y1={margin.top + plotH}
          x2={margin.left + plotW}
          y2={margin.top + plotH}
          stroke="rgba(255,255,255,0.25)"
        />
        {yTicks.map((tick, tickIdx) => {
          const y = margin.top + plotH - ((tick - min) / range) * plotH;
          return (
            <g key={`y-${tickIdx}-${tick}`}>
              <line
                x1={margin.left}
                y1={y}
                x2={margin.left + plotW}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
              />
              <text
                x={margin.left - 8}
                y={y + 4}
                textAnchor="end"
                fill="rgba(255,255,255,0.55)"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {formatAxisValue(tick)}
              </text>
            </g>
          );
        })}
        <text
          x={14}
          y={margin.top + plotH / 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.65)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          transform={`rotate(-90 14 ${margin.top + plotH / 2})`}
        >
          {yTitle}
        </text>
        {points.map((p, i) => {
          const x =
            margin.left +
            (i + 0.5) * (plotW / Math.max(points.length, 1)) -
            barW / 2;
          const barH = (p.value / range) * plotH;
          const y = margin.top + plotH - barH;
          return (
            <g key={`${p.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill="url(#barGradient)"
                rx="2"
              />
              {(i % 2 === 0 || points.length <= 8) && (
                <text
                  x={x + barW / 2}
                  y={margin.top + plotH + 14}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.55)"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                  transform={`rotate(-35 ${x + barW / 2} ${margin.top + plotH + 14})`}
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <text
          x={margin.left + plotW / 2}
          y={height - 8}
          textAnchor="middle"
          fill="rgba(255,255,255,0.65)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          {xTitle}
        </text>
      </svg>
    </div>
  );
}

function normalizeChartProfile(
  profile: ChartProfile,
  columns: string[],
): ChartProfile {
  const hasPayment = columns.includes("payment_type");
  const ym =
    columns.includes("year") && columns.includes("month")
      ? (["year", "month"] as const)
      : columns.includes("order_year") && columns.includes("order_month")
        ? (["order_year", "order_month"] as const)
        : null;
  const valueCol =
    columns.find((c) => c === "average_installments") ??
    columns.find((c) => c === profile.value_column) ??
    profile.value_column;

  if (hasPayment && ym) {
    return {
      chart_type: "surface_3d",
      label_column: ym[0] === "order_year" ? "order_year_month" : "year_month",
      label_columns: [...ym],
      value_column: valueCol,
      series_column: "payment_type",
      title: profile.title.replace(" over time", ""),
      time_series: true,
      x_axis_label: "Period (Year-Month)",
      y_axis_label: humanizeColumn(valueCol),
      z_axis_label: "Payment Type",
    };
  }

  if (
    profile.label_column === "year" &&
    columns.includes("month") &&
    columns.includes("year")
  ) {
    return {
      ...profile,
      chart_type: "line",
      label_column: "year_month",
      label_columns: ["year", "month"],
      time_series: true,
      title: profile.title.includes("by year")
        ? profile.title.replace("by year", "over time")
        : profile.title,
    };
  }
  if (
    profile.label_column === "year" &&
    columns.includes("quarter") &&
    !profile.label_columns
  ) {
    return {
      ...profile,
      chart_type: "line",
      label_column: "year_quarter",
      label_columns: ["year", "quarter"],
      time_series: true,
    };
  }
  return profile;
}

function ResultsChartFromProfile({
  preview,
  profile: rawProfile,
}: {
  preview: ResultPreview;
  profile: ChartProfile;
}) {
  const rows = preview.rows ?? [];
  const columns = preview.columns ?? [];
  if (rows.length === 0) return null;

  const profile = normalizeChartProfile(rawProfile, columns);

  if (profile.chart_type === "surface_3d" && profile.series_column) {
    return <Surface3DChart preview={preview} profile={profile} />;
  }

  const labelCols =
    profile.label_columns ??
    (profile.label_column === "order_year_month"
      ? ["order_year", "order_month"]
      : profile.label_column === "year_month"
        ? ["year", "month"]
        : profile.label_column === "year_quarter"
          ? ["year", "quarter"]
          : [profile.label_column]);

  const buildLabel = (row: Record<string, unknown> | unknown[], idx: number) => {
    if (
      (profile.label_column === "order_year_month" ||
        profile.label_column === "year_month") &&
      labelCols.length >= 2
    ) {
      const y = cellValue(row, labelCols[0], columns);
      const m = cellValue(row, labelCols[1], columns);
      if (y != null && m != null) {
        const month = String(Math.trunc(Number(m))).padStart(2, "0");
        return `${Math.trunc(Number(y))}-${month}`;
      }
    }
    if (profile.label_column === "year_quarter" && labelCols.length >= 2) {
      const y = cellValue(row, labelCols[0], columns);
      const q = cellValue(row, labelCols[1], columns);
      if (y != null && q != null) {
        return `${Math.trunc(Number(y))}-Q${q}`;
      }
    }
    const primary = cellValue(row, profile.label_column, columns);
    return primary != null ? String(primary) : `row ${idx + 1}`;
  };

  const buildSortKey = (row: Record<string, unknown> | unknown[], idx: number) => {
    if (labelCols.length >= 2 && isTimeSeriesProfile(profile)) {
      const a = cellValue(row, labelCols[0], columns);
      const b = cellValue(row, labelCols[1], columns);
      if (a != null && b != null) {
        return `${String(Math.trunc(Number(a))).padStart(4, "0")}-${String(Math.trunc(Number(b))).padStart(2, "0")}`;
      }
    }
    const numeric = Number(buildLabel(row, idx));
    if (!Number.isNaN(numeric) && String(buildLabel(row, idx)).match(/^-?\d/)) {
      return String(numeric).padStart(12, "0");
    }
    return buildLabel(row, idx);
  };

  const points = sortChartPoints(
    rows.slice(0, 24).map((row, idx) => {
      const label = buildLabel(row, idx);
      const raw = cellValue(row, profile.value_column, columns);
      const value = typeof raw === "number" ? raw : Number(raw);
      return {
        label,
        value: Number.isNaN(value) ? 0 : value,
        sortKey: buildSortKey(row, idx),
      };
    }),
    profile,
  );

  if (profile.chart_type === "line" || profile.time_series) {
    return <LineChartWithAxes points={points} profile={profile} />;
  }

  const horizontal = profile.chart_type === "horizontal_bar";

  if (!horizontal) {
    return <VerticalBarChartWithAxes points={points} profile={profile} />;
  }

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="rounded-lg border border-white/10 bg-background/20 p-4 space-y-3">
      <p className="font-mono text-xs tracking-widest text-muted-foreground">
        CHART · {profile.title}
      </p>
      <div className="space-y-2">
        {points.map((p, i) => (
          <div
            key={`${p.label}-${i}`}
            className={`grid items-center gap-3 ${
              horizontal
                ? "grid-cols-[minmax(0,160px)_1fr_minmax(72px,auto)]"
                : "grid-cols-[minmax(0,120px)_1fr]"
            }`}
          >
            <span className="text-xs font-mono truncate text-muted-foreground" title={p.label}>
              {p.label}
            </span>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-agent-cyan/80 to-emerald-400/80"
                style={{ width: `${Math.max(6, (p.value / max) * 100)}%` }}
              />
            </div>
            {horizontal && (
              <span className="text-xs font-mono text-agent-cyan tabular-nums text-right">
                {p.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsChart({
  preview,
  chartProfile,
}: {
  preview: ResultPreview;
  chartProfile?: ChartProfile;
}) {
  if (chartProfile) {
    return <ResultsChartFromProfile preview={preview} profile={chartProfile} />;
  }
  return <ResultsChartLegacy preview={preview} />;
}

function ResultsChartLegacy({ preview }: { preview: ResultPreview }) {
  const picked = pickChartColumns(preview);
  if (!picked) return null;

  const rows = preview.rows ?? [];
  const columns = preview.columns ?? [];
  const points = rows.slice(0, 16).map((row, idx) => {
    const label = String(cellValue(row, picked.label, columns) ?? `row ${idx + 1}`);
    const raw = cellValue(row, picked.value, columns);
    const value = typeof raw === "number" ? raw : Number(raw);
    return { label, value: Number.isNaN(value) ? 0 : value };
  });

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="rounded-lg border border-white/10 bg-background/20 p-4 space-y-3">
      <p className="font-mono text-xs tracking-widest text-muted-foreground">
        CHART · {picked.value} by {picked.label}
      </p>
      <div className="space-y-2">
        {points.map((p, i) => (
          <div
            key={`${p.label}-${i}`}
            className="grid grid-cols-[minmax(0,160px)_1fr_minmax(72px,auto)] items-center gap-3"
          >
            <span className="text-xs font-mono truncate text-muted-foreground" title={p.label}>
              {p.label}
            </span>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-agent-cyan/80 to-emerald-400/80"
                style={{ width: `${Math.max(6, (p.value / max) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-mono text-agent-cyan tabular-nums text-right">
              {p.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeliveryResults({
  runId,
  preview,
  chartProfile,
  complete,
  hasReportPdf,
  hasProfileHtml,
  evaluations,
  testFiles,
  prUrl,
  deliveryPhase,
}: Props) {
  const [profileHtml, setProfileHtml] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasProfileHtml) {
      setProfileHtml(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    fetchProfileHtml(runId)
      .then((html) => {
        if (!cancelled) setProfileHtml(html);
      })
      .catch((e) => {
        if (!cancelled) {
          setProfileError(e instanceof Error ? e.message : "Could not load profile");
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, hasProfileHtml]);

  async function downloadPdf() {
    setPdfDownloading(true);
    setPdfError(null);
    try {
      const blob = await fetchArtifactBlob(`/runs/${runId}/report.pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etl-report-${runId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setPdfDownloading(false);
    }
  }

  async function openProfileTab() {
    try {
      const html = profileHtml ?? (await fetchProfileHtml(runId));
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Could not open profile");
    }
  }

  const hasRows = Boolean(
    preview?.rows?.length &&
      preview.rows.some((r) => {
        if (Array.isArray(r)) return r.some((v) => v != null && v !== "" && v !== "null");
        return Object.values(r as Record<string, unknown>).some(
          (v) => v != null && v !== "" && v !== "null",
        );
      }),
  );

  return (
    <div className="space-y-5 pt-2 border-t border-white/10">
      <div>
        <p className="font-mono text-xs tracking-widest text-agent-cyan">AGENT 4 · DELIVERY</p>
        <p className="text-sm text-muted-foreground mt-1">
          YData profile → unit tests → PR → business results
          {deliveryPhase ? ` · phase: ${deliveryPhase}` : ""}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <PhaseBadge label="Profiling (YData)" ev={evaluations?.profile} />
        <PhaseBadge label="Unit tests (pytest)" ev={evaluations?.tests} />
        <PhaseBadge label="Pull request" ev={evaluations?.pr} />
      </div>

      {testFiles && testFiles.length > 0 && (
        <div className="text-xs font-mono text-muted-foreground">
          Tests: {testFiles.map((f) => f.path).filter(Boolean).join(", ")}
        </div>
      )}

      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-agent-cyan hover:underline"
        >
          <ExternalLink className="h-4 w-4" /> View GitHub PR
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        {hasReportPdf && (
          <button
            type="button"
            onClick={downloadPdf}
            disabled={pdfDownloading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm btn-primary disabled:opacity-50"
          >
            {pdfDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Final delivery PDF
          </button>
        )}
        {hasProfileHtml && (
          <button
            type="button"
            onClick={openProfileTab}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            <ExternalLink className="h-4 w-4" />
            Open YData profile (new tab)
          </button>
        )}
      </div>
      {pdfError && (
        <p className="text-xs text-red-300">{pdfError}</p>
      )}

      {hasProfileHtml && (
        <div>
          <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
            YDATA PROFILE (GRAPHS & STATS)
          </p>
          {profileLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
            </div>
          )}
          {profileError && (
            <p className="text-sm text-red-300 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              {profileError}. Ensure ngrok and the API are running.
            </p>
          )}
          {profileHtml && !profileLoading && (
            <iframe
              title="YData profile"
              srcDoc={profileHtml}
              className="w-full h-[520px] rounded-lg border border-white/10 bg-white"
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </div>
      )}

      <div>
        <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
          BUSINESS RESULTS (TABLE)
        </p>
        <ResultsTable preview={preview} complete={complete} />
      </div>

      {hasRows && preview ? (
        <ResultsChart preview={preview} chartProfile={chartProfile} />
      ) : null}
    </div>
  );
}
