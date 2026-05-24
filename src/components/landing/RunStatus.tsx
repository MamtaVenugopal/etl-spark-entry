import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ExternalLink,
  Download,
  XCircle,
  Circle,
  AlertCircle,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

type StepState = "pending" | "running" | "done" | "failed" | string;
type RunStep = {
  name?: string;
  state?: StepState;
  status?: StepState;
  message?: string;
};

type AgentCheck = { name?: string; passed?: boolean; message?: string };
type AgentReport = {
  agent?: string;
  name?: string;
  passed?: boolean;
  score?: number;
  summary?: string;
  checks?: AgentCheck[];
};

type RunReport = {
  spec?: {
    target_table?: string;
    source_tables?: string[];
    transformations?: string[] | string;
    acceptance_criteria?: string[] | string;
  };
  agents?: AgentReport[];
  artifacts?: { generated_files?: string[] };
  data_validation?: Array<{ name?: string; sql?: string; passed?: boolean; message?: string }>;
  profile_report?: { row_count?: number } & Record<string, unknown>;
  pipeline_passed?: boolean;
};

type RunOutputs = {
  pr_url?: string;
  pr_merged?: boolean;
  pr_merge_message?: string;
  pr_branch_delete_message?: string;
  audit_s3_uri?: string;
  audit_table?: string;
  ydata_profile_s3_uri?: string;
  profile_report?: { row_count?: number };
};

type ResultPreview = {
  columns?: string[];
  rows?: Array<Record<string, unknown> | unknown[]>;
};

export type RunState = {
  run_id: string;
  status: string;
  steps?: RunStep[];
  parsed_spec?: unknown;
  evaluations?: Record<string, unknown>;
  gate_1_auto?: boolean;
  gate_1_confirmed?: boolean;
  gate_2_auto?: boolean;
  gate_2_approved?: boolean;
  outputs?: RunOutputs;
  report?: RunReport;
  result_preview?: ResultPreview;
  jira_sw_key?: string;
  error?: string;
};

const PIPELINE_STEPS = [
  "task_breakdown",
  "coding",
  "pr",
  "execute",
  "profile",
  "deploy",
] as const;

function stepIcon(state: string | undefined) {
  switch ((state || "").toLowerCase()) {
    case "done":
    case "completed":
    case "complete":
    case "passed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "running":
    case "in_progress":
      return <Loader2 className="h-4 w-4 animate-spin text-agent-cyan" />;
    case "failed":
    case "error":
      return <XCircle className="h-4 w-4 text-red-400" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />;
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", headers: JSON_HEADERS });
    return r.ok;
  } catch {
    return false;
  }
}

export function RunStatus({
  initialRun,
  autoGates = false,
  onClose,
}: {
  initialRun: RunState;
  autoGates?: boolean;
  onClose?: () => void;
}) {
  const [run, setRun] = useState<RunState>(initialRun);
  const [acting, setActing] = useState<"confirm" | "approve" | null>(null);
  const [hasResultsPdf, setHasResultsPdf] = useState<boolean>(false);
  const [hasAuditPdf, setHasAuditPdf] = useState<boolean>(false);
  const [hasProfileHtml, setHasProfileHtml] = useState<boolean>(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = (run.status || "").toUpperCase();
  const isComplete = status === "COMPLETE" || status === "COMPLETED";
  const awaitingConfirm = status === "AWAITING_CONFIRMATION";
  const awaitingApprove = status === "AWAITING_PR_APPROVAL";
  const isFailed = status === "FAILED" || status === "ERROR";
  const gate1Auto = Boolean(autoGates || run.gate_1_auto || run.gate_1_confirmed);
  const gate2Auto = Boolean(autoGates || run.gate_2_auto || run.gate_2_approved || run.outputs?.pr_merged);
  // Poll until terminal (COMPLETE/FAILED) or gates awaiting manual input.
  const pauseStatuses = useMemo(
    () =>
      autoGates
        ? ["COMPLETE", "COMPLETED", "FAILED", "ERROR"]
        : ["COMPLETE", "COMPLETED", "FAILED", "ERROR", "AWAITING_CONFIRMATION", "AWAITING_PR_APPROVAL"],
    [autoGates],
  );

  useEffect(() => {
    if (!API_BASE) return;
    if (pauseStatuses.includes(status)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/runs/${run.run_id}`, { headers: JSON_HEADERS });
        if (!r.ok) {
          console.error("Run poll failed", r.status, await r.text().catch(() => ""));
          return;
        }
        const data = (await r.json()) as RunState;
        setRun((prev) => ({ ...prev, ...data }));
      } catch (e) {
        console.error("Run poll error", e);
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [run.run_id, status, pauseStatuses]);

  // Probe artifacts once complete
  useEffect(() => {
    if (!API_BASE) return;
    if (!isComplete && !run.result_preview) return;
    let cancelled = false;
    (async () => {
      const [audit, profile] = await Promise.all([
        headOk(`${API_BASE}/runs/${run.run_id}/report.pdf`),
        headOk(`${API_BASE}/runs/${run.run_id}/profile.html`),
      ]);
      if (cancelled) return;
      setHasAuditPdf(audit);
      setHasProfileHtml(profile);
      if (run.result_preview) {
        const results = await headOk(`${API_BASE}/runs/${run.run_id}/report/results.pdf`);
        if (!cancelled) setHasResultsPdf(results);
      } else {
        setHasResultsPdf(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isComplete, run.run_id, run.result_preview]);

  async function handleAction(kind: "confirm" | "approve") {
    if (!API_BASE) return;
    setActing(kind);
    try {
      const res = await fetch(`${API_BASE}/runs/${run.run_id}/${kind}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const txt = await res.text();
        toast.error(`${kind} failed (${res.status}): ${txt.slice(0, 200)}`);
        return;
      }
      toast.success(kind === "confirm" ? "Spec confirmed." : "PR approved.");
      // Resume polling by bumping a poll tick
      setRun((prev) => ({ ...prev, status: "RUNNING" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${kind} failed`);
    } finally {
      setActing(null);
    }
  }

  function downloadPdf(path: string) {
    if (!API_BASE) return;
    window.open(`${API_BASE}${path}`, "_blank", "noopener,noreferrer");
  }

  const stepByName = new Map<string, RunStep>();
  (run.steps ?? []).forEach((s) => {
    if (s.name) stepByName.set(s.name, s);
  });

  const taskBreakdownAgents = (run.report?.agents ?? []).filter((a) =>
    (a.agent ?? a.name ?? "").toLowerCase().includes("task_breakdown"),
  );

  return (
    <div
      className="mt-8 rounded-2xl border border-white/10 bg-card/40 backdrop-blur p-6 md:p-8 space-y-6"
      style={{ boxShadow: "var(--shadow-glow-cyan)" }}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs tracking-widest text-agent-cyan">
          RUN · {run.run_id}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              isComplete
                ? "border-emerald-500/40 text-emerald-300"
                : isFailed
                ? "border-red-500/40 text-red-300"
                : awaitingConfirm || awaitingApprove
                ? "border-amber-500/40 text-amber-300"
                : "border-white/15"
            }
          >
            {run.status || "…"}
          </Badge>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {isFailed && run.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-1">
          <div className="flex items-center gap-2 text-red-300">
            <XCircle className="h-5 w-5" />
            <span className="font-semibold">Run failed</span>
          </div>
          <pre className="text-xs text-red-200/90 whitespace-pre-wrap font-mono">{run.error}</pre>
        </div>
      )}

      {isComplete && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">
              {run.report?.pipeline_passed === false ? "Run complete (pipeline checks failed)" : "Run complete"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {run.jira_sw_key && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-200 font-mono">
                Jira: {run.jira_sw_key}
              </Badge>
            )}
            {run.outputs?.pr_url && (
              <a
                href={run.outputs.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-agent-cyan hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Pull Request
              </a>
            )}
            {typeof (run.outputs?.profile_report?.row_count ?? run.report?.profile_report?.row_count) === "number" && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-200 font-mono">
                rows: {run.outputs?.profile_report?.row_count ?? run.report?.profile_report?.row_count}
              </Badge>
            )}
          </div>
          {run.outputs?.pr_merge_message && (
            <p className="text-xs text-muted-foreground">{run.outputs.pr_merge_message}</p>
          )}
          {run.outputs?.pr_branch_delete_message && (
            <p className="text-xs text-muted-foreground">{run.outputs.pr_branch_delete_message}</p>
          )}
          {(run.outputs?.audit_s3_uri || run.outputs?.audit_table) && (
            <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
              {run.outputs?.audit_table && <div>audit table: {run.outputs.audit_table}</div>}
              {run.outputs?.audit_s3_uri && <div>audit s3: {run.outputs.audit_s3_uri}</div>}
            </div>
          )}
          {run.outputs?.ydata_profile_s3_uri && (
            <div className="text-xs font-mono text-muted-foreground">
              YData profile s3: {run.outputs.ydata_profile_s3_uri}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {hasAuditPdf && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPdf(`/runs/${run.run_id}/report.pdf`)}
              >
                <Download className="h-4 w-4" /> Audit PDF
              </Button>
            )}
            {hasProfileHtml && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPdf(`/runs/${run.run_id}/profile.html`)}
              >
                <ExternalLink className="h-4 w-4" /> YData profile (HTML)
              </Button>
            )}
            {hasResultsPdf && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPdf(`/runs/${run.run_id}/report/results.pdf`)}
              >
                <Download className="h-4 w-4" /> Results PDF
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pipeline progress */}
      <div>
        <div className="font-mono text-xs tracking-widest text-muted-foreground mb-3">
          PIPELINE
        </div>
        <ol className="grid gap-2 md:grid-cols-5">
          {PIPELINE_STEPS.map((name) => {
            const s = stepByName.get(name);
            const st = (s?.state ?? s?.status ?? "pending") as string;
            return (
              <li
                key={name}
                className="rounded-md border border-white/10 bg-background/30 p-3 flex items-center gap-2"
              >
                {stepIcon(st)}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{name}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{st}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Gate 1: spec confirmation */}
      {gate1Auto ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2 text-sm text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-semibold">Gate 1:</span>
          <span>Auto-approved (spec & schema checks passed)</span>
        </div>
      ) : awaitingConfirm ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">Gate 1 · Confirm spec</span>
          </div>

          {run.report?.spec && (
            <div className="grid gap-2 text-sm">
              <SpecRow label="Target table" value={run.report.spec.target_table} />
              <SpecRow
                label="Source tables"
                value={(run.report.spec.source_tables ?? []).join(", ")}
              />
              <SpecList label="Transformations" value={run.report.spec.transformations} />
              <SpecList label="Acceptance criteria" value={run.report.spec.acceptance_criteria} />
            </div>
          )}

          {taskBreakdownAgents.length > 0 && (
            <Accordion type="single" collapsible className="w-full">
              {taskBreakdownAgents.map((a, i) => (
                <AccordionItem key={i} value={`tb-${i}`} className="border-white/10">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          a.passed
                            ? "border-emerald-500/40 text-emerald-300"
                            : "border-red-500/40 text-red-300"
                        }
                      >
                        {a.passed ? "passed" : "failed"}
                      </Badge>
                      <span className="font-mono">{a.agent ?? a.name ?? "task_breakdown"}</span>
                      {typeof a.score === "number" && (
                        <span className="text-xs text-muted-foreground">score {a.score}</span>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {a.summary && <p className="text-sm mb-2">{a.summary}</p>}
                    {(a.checks ?? []).map((c, j) => (
                      <div key={j} className="text-xs flex items-start gap-2 py-1">
                        {c.passed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5" />
                        )}
                        <div>
                          <div className="font-mono">{c.name}</div>
                          {c.message && (
                            <div className="text-muted-foreground">{c.message}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          <Button
            onClick={() => handleAction("confirm")}
            disabled={acting !== null}
            className="border border-white/15"
            style={{ background: "var(--gradient-agent)" }}
          >
            {acting === "confirm" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirm spec
          </Button>
        </div>
      ) : null}

      {/* Gate 2: PR approval */}
      {gate2Auto ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-semibold">Gate 2:</span>
            <span>Auto-approved (PR merged)</span>
          </div>
          {run.outputs?.pr_url && (
            <a
              href={run.outputs.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-agent-cyan hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> {run.outputs.pr_url}
            </a>
          )}
          {run.outputs?.pr_merge_message && (
            <div className="text-xs text-muted-foreground">{run.outputs.pr_merge_message}</div>
          )}
          {run.outputs?.pr_branch_delete_message && (
            <div className="text-xs text-muted-foreground">{run.outputs.pr_branch_delete_message}</div>
          )}
        </div>
      ) : awaitingApprove ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-300">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-semibold">Gate 2 · Approve PR</span>
          </div>
          {run.outputs?.pr_url && (
            <a
              href={run.outputs.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-agent-cyan hover:underline text-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" /> {run.outputs.pr_url}
            </a>
          )}
          <Button
            onClick={() => handleAction("approve")}
            disabled={acting !== null}
            className="border border-white/15"
            style={{ background: "var(--gradient-agent)" }}
          >
            {acting === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Approve & merge PR
          </Button>
        </div>
      ) : null}

      {/* Tabs: results + audit */}
      <Tabs defaultValue="results" className="w-full">
        <TabsList>
          <TabsTrigger value="results">Business results</TabsTrigger>
          <TabsTrigger value="audit">Audit &amp; lineage</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-3">
          <ResultsTable preview={run.result_preview} complete={isComplete} />
          <div>
            {hasResultsPdf ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadPdf(`/runs/${run.run_id}/report/results.pdf`)}
              >
                <Download className="h-4 w-4" /> Download results PDF
              </Button>
            ) : (
              isComplete && (
                <p className="text-xs text-muted-foreground">Results PDF coming soon.</p>
              )
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AgentsList agents={run.report?.agents ?? []} />

          {(run.report?.artifacts?.generated_files ?? []).length > 0 && (
            <div>
              <div className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
                GENERATED FILES
              </div>
              <ul className="space-y-1 font-mono text-xs">
                {run.report!.artifacts!.generated_files!.map((f, i) => (
                  <li key={i} className="text-muted-foreground">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {run.outputs?.pr_url && (
            <div className="text-sm flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">PR:</span>
              <a
                href={run.outputs.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-agent-cyan hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {run.outputs.pr_url}
              </a>
              {run.outputs.pr_merged && (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                  merged
                </Badge>
              )}
            </div>
          )}

          <div>
            {hasAuditPdf ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadPdf(`/runs/${run.run_id}/report.pdf`)}
              >
                <Download className="h-4 w-4" /> Download audit PDF
              </Button>
            ) : (
              isComplete && (
                <p className="text-xs text-muted-foreground">Audit PDF coming soon.</p>
              )
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-[140px]">{label}:</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function SpecList({ label, value }: { label: string; value?: string[] | string }) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-muted-foreground">{label}:</div>
      <ul className="list-disc pl-5 mt-1 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="font-mono text-xs">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultsTable({
  preview,
  complete,
}: {
  preview?: ResultPreview;
  complete: boolean;
}) {
  const rows = preview?.rows ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {complete
          ? "Run complete. Results will appear after deploy runs on Databricks (Agent 5)."
          : "Results will appear after deploy runs on Databricks (Agent 5)."}
      </p>
    );
  }
  const columns =
    preview?.columns ??
    (Array.isArray(rows[0])
      ? rows[0].map((_, i) => `col_${i}`)
      : Object.keys(rows[0] as Record<string, unknown>));

  return (
    <div className="rounded-md border border-white/10 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c} className="font-mono text-xs">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c, j) => {
                const v = Array.isArray(row)
                  ? row[j]
                  : (row as Record<string, unknown>)[c];
                return (
                  <TableCell key={c} className="font-mono text-xs">
                    {v == null ? "" : String(v)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AgentsList({ agents }: { agents: AgentReport[] }) {
  if (agents.length === 0) {
    return <p className="text-sm text-muted-foreground">No agent reports yet.</p>;
  }
  return (
    <Accordion type="multiple" className="w-full">
      {agents.map((a, i) => (
        <AccordionItem key={i} value={`a-${i}`} className="border-white/10">
          <AccordionTrigger className="text-sm">
            <span className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={
                  a.passed
                    ? "border-emerald-500/40 text-emerald-300"
                    : "border-red-500/40 text-red-300"
                }
              >
                {a.passed ? "passed" : "failed"}
              </Badge>
              <span className="font-mono">{a.agent ?? a.name ?? `agent_${i}`}</span>
              {typeof a.score === "number" && (
                <span className="text-xs text-muted-foreground">score {a.score}</span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {a.summary && <p className="text-sm mb-2">{a.summary}</p>}
            <div className="space-y-1">
              {(a.checks ?? []).map((c, j) => (
                <div key={j} className="text-xs flex items-start gap-2">
                  {c.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5" />
                  )}
                  <div>
                    <div className="font-mono">{c.name}</div>
                    {c.message && <div className="text-muted-foreground">{c.message}</div>}
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
