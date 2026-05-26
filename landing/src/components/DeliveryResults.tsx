import { CheckCircle2, Download, ExternalLink, XCircle } from "lucide-react";
import { artifactUrl } from "@/lib/api";
import type { ResultPreview } from "@/lib/types";

type EvalEntry = { passed?: boolean; summary?: string };

type Props = {
  runId: string;
  preview?: ResultPreview;
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

function ResultsChart({ preview }: { preview: ResultPreview }) {
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
  complete,
  hasReportPdf,
  hasProfileHtml,
  evaluations,
  testFiles,
  prUrl,
  deliveryPhase,
}: Props) {
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
          <a
            href={artifactUrl(`/runs/${runId}/report.pdf`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm btn-primary"
          >
            <Download className="h-4 w-4" />
            Final delivery PDF
          </a>
        )}
        {hasProfileHtml && (
          <a
            href={artifactUrl(`/runs/${runId}/profile.html`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            <ExternalLink className="h-4 w-4" />
            Open YData profile (new tab)
          </a>
        )}
      </div>

      {hasProfileHtml && (
        <div>
          <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
            YDATA PROFILE (GRAPHS & STATS)
          </p>
          <iframe
            title="YData profile"
            src={artifactUrl(`/runs/${runId}/profile.html`)}
            className="w-full h-[520px] rounded-lg border border-white/10 bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      <div>
        <p className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
          BUSINESS RESULTS (TABLE)
        </p>
        <ResultsTable preview={preview} complete={complete} />
      </div>

      {hasRows && preview ? <ResultsChart preview={preview} /> : null}
    </div>
  );
}
