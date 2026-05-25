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
  Copy,
  Link2,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const PUBLIC_RUN_BASE =
  (import.meta.env.VITE_PUBLIC_RUN_BASE as string | undefined) || API_BASE;

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

type EvaluationEntry = {
  passed?: boolean;
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
  artifacts?: {
    generated_files?: Array<string | { path?: string; language?: string }>;
    pr_url?: string;
    pr_merged?: boolean;
    downloads?: Array<{ label: string; url: string }>;
  };
  data_validation?: Array<{ name?: string; sql?: string; passed?: boolean; message?: string }>;
  profile_report?: { row_count?: number } & Record<string, unknown>;
  pipeline_passed?: boolean;
  lineage?: {
    bronze_tables?: string[];
    gold_path?: string;
    joins?: string[];
  };
};

type RunOutputs = {
  customer_run_url?: string;
  pr_url?: string;
  pr_merged?: boolean;
  pr_merge_message?: string;
  pr_branch_delete_message?: string;
  emr_job_flow_id?: string;
  emr_script_s3_uri?: string;
  gold_s3_uri?: string;
  glue_table_fqn?: string;
  glue_columns?: { name: string; type: string }[];
  execute_log?: string;
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
  story_id?: string;
  title?: string;
  status: string;
  current_step?: string;
  steps?: RunStep[];
  parsed_spec?: unknown;
  evaluations?: Record<string, EvaluationEntry>;
  gate_1_auto?: boolean;
  gate_1_confirmed?: boolean;
  gate_2_auto?: boolean;
  gate_2_approved?: boolean;
  outputs?: RunOutputs;
  report?: RunReport;
  result_preview?: ResultPreview;
  customer_run_url?: string;
  jira_sw_key?: string;
  jira_sd_key?: string;
  error?: string;
  data_validation?: Array<{ name?: string; passed?: boolean; message?: string }>;
};

// Target 4-step pipeline
const PIPELINE_STEPS = [
  { key: "task_breakdown", label: "1. Spec", desc: "Parse story → ETL plan" },
  { key: "coding", label: "2. Code", desc: "Generate Spark + DAG" },
  { key: "execute", label: "3. Execute", desc: "EMR → gold on S3 + Glue" },
  { key: "delivery", label: "4. Deliver", desc: "Profile → test → PR → PDF" },
] as const;

// Legacy step names that roll up into "delivery"
const DELIVERY_LEGACY = ["delivery", "pr", "profile", "deploy"] as const;

const DELIVERY_PHASES = [
  { key: "profile", label: "Profiling" },
  { key: "tests", label: "Testing" },
  { key: "pr", label: "Pull request" },
  { key: "deploy", label: "Report" },
] as const;

function normalizeState(st: string | undefined): "pending" | "running" | "done" | "failed" {
  const s = (st || "").toLowerCase();
  if (["done", "completed", "complete", "passed", "success"].includes(s)) return "done";
  if (["running", "in_progress", "started"].includes(s)) return "running";
  if (["failed", "error"].includes(s)) return "failed";
  return "pending";
}

function stepIcon(state: string | undefined) {
  switch (normalizeState(state)) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-agent-cyan" />;
    case "failed":
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

function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Copied to clipboard"))
    .catch(() => toast.error("Copy failed"));
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
  const gate2Auto = Boolean(
    autoGates || run.gate_2_auto || run.gate_2_approved || run.outputs?.pr_merged,
  );

  // Stop polling on terminal statuses or awaiting gates.
  const pauseStatuses = useMemo(
    () => ["COMPLETE", "COMPLETED", "FAILED", "ERROR", "AWAITING_CONFIRMATION", "AWAITING_PR_APPROVAL"],
    [],
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
      setRun((prev) => ({ ...prev, status: "RUNNING" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${kind} failed`);
    } finally {
      setActing(null);
    }
  }

  function openApi(path: string) {
    if (!API_BASE) return;
    window.open(`${API_BASE}${path}`, "_blank", "noopener,noreferrer");
  }

  // Build a map of step name -> step state (lowercase keys).
  const stepByName = new Map<string, RunStep>();
  (run.steps ?? []).forEach((s) => {
    if (s.name) stepByName.set(s.name.toLowerCase(), s);
  });

  // Roll up legacy steps into "delivery"
  function getStepState(key: string): "pending" | "running" | "done" | "failed" {
    if (key !== "delivery") {
      const s = stepByName.get(key);
      return normalizeState(s?.state ?? s?.status);
    }
    // Aggregate delivery from any of the legacy names + delivery itself
    const states = DELIVERY_LEGACY.map((n) => {
      const s = stepByName.get(n);
      return s ? normalizeState(s.state ?? s.status) : null;
    }).filter(Boolean) as Array<"pending" | "running" | "done" | "failed">;
    if (states.length === 0) return "pending";
    if (states.some((s) => s === "failed")) return "failed";
    if (states.some((s) => s === "running")) return "running";
    if (states.every((s) => s === "done")) return "done";
    if (states.some((s) => s === "done")) return "running";
    return "pending";
  }

  // Delivery sub-phase derivation from evaluations + steps
  function getPhaseState(phaseKey: string): "pending" | "running" | "done" | "failed" {
    const ev = run.evaluations?.[phaseKey];
    const step = stepByName.get(phaseKey);
    const stepSt = step ? normalizeState(step.state ?? step.status) : null;
    if (stepSt === "failed") return "failed";
    if (ev?.passed === false) return "failed";
    if (ev?.passed === true || stepSt === "done") return "done";
    if (stepSt === "running") return "running";
    // If execute is done and delivery is running, show profile as running first
    return "pending";
  }

  const executeDone = getStepState("execute") === "done";
  const deliveryState = getStepState("delivery");

  const failedStep = (run.steps ?? []).find(
    (s) => normalizeState(s.state ?? s.status) === "failed",
  );

  const profileFailed =
    run.evaluations?.profile?.passed === false || getPhaseState("profile") === "failed";

  const customerRunUrl =
    run.customer_run_url ||
    run.outputs?.customer_run_url ||
    (PUBLIC_RUN_BASE ? `${PUBLIC_RUN_BASE}/runs/${run.run_id}` : "");

  const downloads = run.report?.artifacts?.downloads ?? [];

  if (!API_BASE) {
    return (
      <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-5 w-5" /> API URL not configured
        </div>
        <p className="text-sm mt-2">
          Set <code className="font-mono">VITE_API_BASE_URL</code> in your project settings.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mt-8 rounded-2xl border border-white/10 bg-card/40 backdrop-blur p-6 md:p-8 space-y-6"
      style={{ boxShadow: "var(--shadow-glow-cyan)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-mono text-xs tracking-widest text-agent-cyan">
          RUN · {run.run_id}
          {run.current_step && (
            <span className="ml-3 text-muted-foreground">step: {run.current_step}</span>
          )}
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

      {/* Customer delivery link — visible from submit onward */}
      {customerRunUrl && (
        <div className="rounded-lg border border-white/10 bg-background/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4 text-agent-cyan" />
            <span className="font-semibold">Customer delivery link</span>
            {run.jira_sw_key && (
              <Badge variant="outline" className="border-white/15 font-mono text-xs">
                {run.jira_sw_key}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={customerRunUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-agent-cyan hover:underline break-all"
            >
              {customerRunUrl}
            </a>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(customerRunUrl)}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This link is stored on the Jira ticket for the customer.
          </p>
        </div>
      )}

      {/* Failed banner */}
      {isFailed && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-300">
            <XCircle className="h-5 w-5" />
            <span className="font-semibold">Run failed</span>
            {failedStep?.name && (
              <Badge variant="outline" className="border-red-500/40 text-red-300 font-mono text-xs">
                step: {failedStep.name}
              </Badge>
            )}
          </div>
          {run.error && (
            <pre className="text-xs text-red-200/90 whitespace-pre-wrap font-mono">
              {run.error}
            </pre>
          )}
          {run.error && /glue|gold|emr/i.test(run.error) && (
            <p className="text-xs text-amber-300">
              Hint: Execute step must materialize gold before delivery profiling.
            </p>
          )}
        </div>
      )}

      {/* Complete banner */}
      {isComplete && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">
              {run.report?.pipeline_passed === false
                ? "Complete with check failures"
                : "Run complete"}
            </span>
          </div>
          {run.outputs?.pr_merge_message && (
            <p className="text-xs text-muted-foreground">{run.outputs.pr_merge_message}</p>
          )}
          {run.outputs?.pr_branch_delete_message && (
            <p className="text-xs text-muted-foreground">
              {run.outputs.pr_branch_delete_message}
            </p>
          )}
        </div>
      )}

      {/* 4-step pipeline */}
      <div>
        <div className="font-mono text-xs tracking-widest text-muted-foreground mb-3">
          PIPELINE
        </div>
        <ol className="grid gap-2 md:grid-cols-4">
          {PIPELINE_STEPS.map((step) => {
            const st = getStepState(step.key);
            return (
              <li
                key={step.key}
                className="rounded-md border border-white/10 bg-background/30 p-3 flex items-center gap-2"
              >
                {stepIcon(st)}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{step.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{step.desc}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{st}</div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Delivery sub-phases */}
        {(executeDone || deliveryState !== "pending") && (
          <div className="mt-3 rounded-md border border-white/10 bg-background/20 p-3">
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">
              DELIVERY PHASES
            </div>
            <ol className="flex flex-wrap items-center gap-2">
              {DELIVERY_PHASES.map((p, i) => {
                const st = getPhaseState(p.key);
                return (
                  <li key={p.key} className="flex items-center gap-1.5">
                    {stepIcon(st)}
                    <span
                      className={
                        "font-mono text-xs " +
                        (st === "failed"
                          ? "text-red-300"
                          : st === "done"
                          ? "text-emerald-300"
                          : st === "running"
                          ? "text-agent-cyan"
                          : "text-muted-foreground")
                      }
                    >
                      {p.label}
                    </span>
                    {i < DELIVERY_PHASES.length - 1 && (
                      <span className="text-muted-foreground">→</span>
                    )}
                  </li>
                );
              })}
            </ol>
            {profileFailed && (
              <p className="text-xs text-red-300 mt-2">
                Profiling failed — PR and final PDF will not be published.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Gate 1 */}
      {gate1Auto ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2 text-sm text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-semibold">Gate 1:</span>
          <span>Automated (spec & schema checks)</span>
        </div>
      ) : awaitingConfirm ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">Gate 1 · Confirm spec</span>
          </div>
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

      {/* Gate 2 */}
      {gate2Auto ? (
        run.outputs?.pr_url && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200 space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-semibold">Gate 2:</span>
              <span>Automated (PR merged inside delivery)</span>
            </div>
            <a
              href={run.outputs.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-agent-cyan hover:underline text-xs"
            >
              <ExternalLink className="h-3 w-3" /> {run.outputs.pr_url}
            </a>
          </div>
        )
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
            Approve &amp; merge PR
          </Button>
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs defaultValue="spec" className="w-full">
        <TabsList>
          <TabsTrigger value="spec">Spec</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* SPEC tab — "How this gold table was built" */}
        <TabsContent value="spec" className="space-y-4">
          <div className="font-mono text-xs tracking-widest text-muted-foreground">
            HOW THIS GOLD TABLE WAS BUILT
          </div>
          {run.report?.spec ? (
            <div className="grid gap-2 text-sm">
              <SpecRow label="Target table" value={run.report.spec.target_table} />
              <SpecRow
                label="Source tables"
                value={(run.report.spec.source_tables ?? []).join(", ")}
              />
              <SpecList label="Transformations" value={run.report.spec.transformations} />
              <SpecList
                label="Acceptance criteria"
                value={run.report.spec.acceptance_criteria}
              />
              <SpecRow label="Gold S3 path" value={run.outputs?.gold_s3_uri} />
              <SpecRow label="Glue table" value={run.outputs?.glue_table_fqn} />
              <SpecRow label="EMR cluster" value={run.outputs?.emr_job_flow_id} />
              <SpecRow label="EMR script" value={run.outputs?.emr_script_s3_uri} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Spec will appear after task_breakdown.</p>
          )}

          {(run.outputs?.glue_columns ?? []).length > 0 && (
            <div>
              <div className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
                GLUE COLUMNS
              </div>
              <div className="rounded-md border border-white/10 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono text-xs">name</TableHead>
                      <TableHead className="font-mono text-xs">type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.outputs!.glue_columns!.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-mono text-xs">{c.name}</TableCell>
                        <TableCell className="font-mono text-xs">{c.type}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {run.report?.lineage && (
            <div className="text-xs font-mono text-muted-foreground space-y-1">
              {run.report.lineage.bronze_tables?.length ? (
                <div>bronze: {run.report.lineage.bronze_tables.join(", ")}</div>
              ) : null}
              {run.report.lineage.gold_path && <div>gold: {run.report.lineage.gold_path}</div>}
              {run.report.lineage.joins?.map((j, i) => (
                <div key={i}>join: {j}</div>
              ))}
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
                <ExternalLink className="h-3.5 w-3.5" /> View on GitHub
              </a>
              {run.outputs.pr_merged && (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                  merged
                </Badge>
              )}
            </div>
          )}
        </TabsContent>

        {/* QUALITY tab */}
        <TabsContent value="quality" className="space-y-4">
          {run.evaluations?.profile ? (
            <div className="rounded-md border border-white/10 p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {run.evaluations.profile.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="font-semibold">Profiling (sanitized)</span>
              </div>
              {run.evaluations.profile.summary && (
                <p className="text-xs text-muted-foreground">
                  {run.evaluations.profile.summary}
                </p>
              )}
              {typeof (run.outputs?.profile_report?.row_count ??
                run.report?.profile_report?.row_count) === "number" && (
                <div className="text-xs font-mono text-muted-foreground">
                  rows:{" "}
                  {run.outputs?.profile_report?.row_count ??
                    run.report?.profile_report?.row_count}
                  {hasProfileHtml && (
                    <>
                      {" · "}
                      <a
                        href={`${API_BASE}/runs/${run.run_id}/profile.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-agent-cyan hover:underline"
                      >
                        Open YData profile
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Profiling results appear after the execute step.
            </p>
          )}

          {((run.report?.data_validation ?? run.data_validation) ?? []).length > 0 && (
            <div>
              <div className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
                DATA VALIDATION (SQL)
              </div>
              <ul className="space-y-2">
                {(run.report?.data_validation ?? run.data_validation ?? []).map((c, i) => (
                  <li key={i} className="text-xs flex items-start gap-2">
                    {c.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono">{c.name}</div>
                      {(c as { sql?: string }).sql && (
                        <pre className="text-muted-foreground whitespace-pre-wrap font-mono mt-1">
                          {(c as { sql?: string }).sql}
                        </pre>
                      )}
                      {c.message && (
                        <div className="text-muted-foreground">{c.message}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {/* DOWNLOADS tab */}
        <TabsContent value="downloads" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {hasAuditPdf && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openApi(`/runs/${run.run_id}/report.pdf`)}
              >
                <Download className="h-4 w-4" /> Final delivery PDF
              </Button>
            )}
            {hasProfileHtml && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openApi(`/runs/${run.run_id}/profile.html`)}
              >
                <ExternalLink className="h-4 w-4" /> YData profile (HTML)
              </Button>
            )}
            {hasResultsPdf && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openApi(`/runs/${run.run_id}/report/results.pdf`)}
              >
                <Download className="h-4 w-4" /> Business results PDF
              </Button>
            )}
            {downloads.map((d) => (
              <Button
                key={d.url}
                size="sm"
                variant="outline"
                onClick={() => window.open(d.url, "_blank", "noopener,noreferrer")}
              >
                <Download className="h-4 w-4" /> {d.label}
              </Button>
            ))}
          </div>

          {(run.outputs?.audit_s3_uri || run.outputs?.audit_table || run.outputs?.ydata_profile_s3_uri) && (
            <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
              {run.outputs?.audit_table && <div>audit table: {run.outputs.audit_table}</div>}
              {run.outputs?.audit_s3_uri && <div>audit s3: {run.outputs.audit_s3_uri}</div>}
              {run.outputs?.ydata_profile_s3_uri && (
                <div>ydata s3: {run.outputs.ydata_profile_s3_uri}</div>
              )}
            </div>
          )}

          {!hasAuditPdf && !hasProfileHtml && !hasResultsPdf && downloads.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Downloads appear when the delivery step publishes artifacts.
            </p>
          )}
        </TabsContent>

        {/* PREVIEW tab */}
        <TabsContent value="preview" className="space-y-3">
          <ResultsTable preview={run.result_preview} complete={isComplete} />
        </TabsContent>

        {/* AUDIT tab */}
        <TabsContent value="audit" className="space-y-4">
          <AgentsList agents={run.report?.agents ?? []} />
          {(run.report?.artifacts?.generated_files ?? []).length > 0 && (
            <div>
              <div className="font-mono text-xs tracking-widest text-muted-foreground mb-2">
                GENERATED FILES
              </div>
              <ul className="space-y-1 font-mono text-xs">
                {run.report!.artifacts!.generated_files!.map((f, i) => {
                  const path = typeof f === "string" ? f : f?.path ?? "";
                  const lang = typeof f === "string" ? "" : f?.language ?? "";
                  return (
                    <li key={i} className="text-muted-foreground">
                      {path}
                      {lang && <span className="ml-2 text-[10px]">[{lang}]</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      <span className="text-muted-foreground min-w-[140px]">{label}:</span>
      <span className="font-mono break-all">{value}</span>
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
          ? "Run complete. No sample preview returned."
          : "Sample preview will appear when delivery finishes."}
      </p>
    );
  }
  const columns =
    preview?.columns ??
    (Array.isArray(rows[0])
      ? rows[0].map((_, i) => `col_${i}`)
      : Object.keys(rows[0] as Record<string, unknown>));

  const limited = rows.slice(0, 20);

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
          {limited.map((row, i) => (
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
