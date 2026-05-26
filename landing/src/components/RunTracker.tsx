import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { DeliveryResults } from "@/components/DeliveryResults";
import {
  API_BASE,
  approveRun,
  confirmRun,
  fetchRun,
  apiConfigured,
} from "@/lib/api";
import type { RunState } from "@/lib/types";

const PIPELINE_STEPS = [
  { key: "task_breakdown", label: "1. Spec", desc: "Parse story → ETL plan" },
  { key: "coding", label: "2. Code", desc: "Generate Spark + DAG" },
  { key: "execute", label: "3. Execute", desc: "EMR → gold on S3 + Glue" },
  { key: "delivery", label: "4. Deliver", desc: "Profile → test → PR → PDF" },
] as const;

const DELIVERY_LEGACY = ["delivery", "pr", "profile", "deploy"] as const;

function normalizeState(st: string | undefined): "pending" | "running" | "done" | "failed" {
  const s = (st || "").toLowerCase();
  if (["done", "completed", "complete", "passed", "success"].includes(s)) return "done";
  if (["running", "in_progress", "started", "queued"].includes(s)) return "running";
  if (["failed", "error"].includes(s)) return "failed";
  return "pending";
}

function StepIcon({ state }: { state: string | undefined }) {
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

type Props = {
  runId: string;
  initialRun?: Partial<RunState>;
  autoGates?: boolean;
};

export function RunTracker({ runId, initialRun, autoGates = false }: Props) {
  const [run, setRun] = useState<RunState>({
    run_id: runId,
    status: initialRun?.status ?? "PENDING",
    ...initialRun,
  });
  const [acting, setActing] = useState<"confirm" | "approve" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = (run.status || "").toUpperCase();
  const isComplete = status === "COMPLETE" || status === "COMPLETED";
  const awaitingConfirm = status === "AWAITING_CONFIRMATION";
  const awaitingApprove = status === "AWAITING_PR_APPROVAL";
  const needsInfo = status === "NEEDS_INFO";
  const isFailed = status === "FAILED" || status === "ERROR";
  const isQueued = status === "QUEUED";

  const pauseStatuses = useMemo(
    () => [
      "COMPLETE",
      "COMPLETED",
      "FAILED",
      "ERROR",
      "NEEDS_INFO",
      "AWAITING_CONFIRMATION",
      "AWAITING_PR_APPROVAL",
    ],
    [],
  );

  useEffect(() => {
    if (!apiConfigured()) return;

    const tick = async () => {
      try {
        const data = await fetchRun(runId);
        setRun(data);
        setLoadError(null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Poll failed");
      }
    };

    tick();
    if (!pauseStatuses.includes(status)) {
      pollRef.current = setInterval(tick, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runId, status, pauseStatuses]);

  const resultPreview = run.result_preview ?? run.report?.result_preview;

  const stepByName = new Map<string, { state?: string; status?: string }>();
  (run.steps ?? []).forEach((s) => {
    if (s.name) stepByName.set(s.name.toLowerCase(), s);
  });

  function getStepState(key: string): "pending" | "running" | "done" | "failed" {
    if (key !== "delivery") {
      const s = stepByName.get(key);
      return normalizeState(s?.state ?? s?.status);
    }
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

  const deliveryDone = getStepState("delivery") === "done";

  const hasReportPdf =
    isComplete ||
    Boolean(run.outputs?.report_pdf_stored) ||
    Boolean(run.parsed_spec);
  const hasProfileHtml = Boolean(
    run.outputs?.ydata_profile_html || run.outputs?.profile_report_url,
  );

  async function handleAction(kind: "confirm" | "approve") {
    setActing(kind);
    try {
      if (kind === "confirm") await confirmRun(runId);
      else await approveRun(runId);
      setRun((prev) => ({ ...prev, status: "RUNNING" }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : `${kind} failed`);
    } finally {
      setActing(null);
    }
  }

  function resolveCustomerUrl(): string {
    const raw = run.customer_run_url || run.outputs?.customer_run_url || "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (raw.startsWith("/runs/")) {
      // Backend often stores relative path when PUBLIC_API_BASE_URL is unset — use landing app URL
      if (typeof window !== "undefined") {
        return `${window.location.origin}${raw}`;
      }
    }
    if (API_BASE) return `${API_BASE}/runs/${runId}`;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/runs/${runId}`;
    }
    return `/runs/${runId}`;
  }

  const customerUrl = resolveCustomerUrl();

  const blocking = run.outputs?.blocking_questions ?? [];

  if (!apiConfigured()) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
        Set VITE_API_BASE_URL in landing/.env
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur p-6 md:p-8 space-y-6 card-glow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-agent-cyan">AGENT RUN</p>
          <h1 className="text-xl font-bold mt-1 font-mono break-all">{runId}</h1>
          {run.title && <p className="text-sm text-muted-foreground mt-1">{run.title}</p>}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-mono uppercase ${
            isComplete
              ? "border-emerald-500/40 text-emerald-300"
              : isFailed || needsInfo
                ? "border-red-500/40 text-red-300"
                : isQueued
                  ? "border-amber-500/40 text-amber-300"
                  : "border-white/15"
          }`}
        >
          {run.status || "…"}
        </span>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {loadError}
        </div>
      )}

      {isQueued && run.outputs && "queue_message" in (run.outputs as object) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {(run.outputs as { queue_message?: string }).queue_message ?? "Waiting in worker queue…"}
        </div>
      )}

      {needsInfo && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <AlertCircle className="h-5 w-5" /> Action required
          </div>
          {blocking.length > 0 ? (
            <ul className="list-disc pl-5 text-xs font-mono text-amber-100/90 space-y-1">
              {blocking.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          ) : (
            run.error && <pre className="text-xs whitespace-pre-wrap font-mono">{run.error}</pre>
          )}
        </div>
      )}

      {isFailed && run.error && !needsInfo && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 text-red-300 font-semibold mb-2">
            <XCircle className="h-5 w-5" /> Run failed
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono text-red-100/90">{run.error}</pre>
        </div>
      )}

      {isComplete && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200 text-sm">
          <CheckCircle2 className="inline h-4 w-4 mr-2" />
          Pipeline complete.
        </div>
      )}

      {customerUrl && (
        <div className="rounded-lg border border-white/10 bg-background/30 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Customer / Jira link</span>
            {run.jira_sw_key && (
              <span className="rounded border border-white/15 px-2 py-0.5 font-mono text-xs">
                {run.jira_sw_key}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={customerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-agent-cyan hover:underline break-all"
            >
              {customerUrl}
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(customerUrl)}
              className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-xs"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="font-mono text-xs tracking-widest text-muted-foreground mb-3">PIPELINE</p>
        <ol className="grid gap-2 md:grid-cols-4">
          {PIPELINE_STEPS.map((step) => {
            const st = getStepState(step.key);
            return (
              <li
                key={step.key}
                className="rounded-md border border-white/10 bg-background/30 p-3 flex items-start gap-2"
              >
                <StepIcon state={st} />
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">{step.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{step.desc}</div>
                  <div className="text-[10px] uppercase text-muted-foreground mt-1">{st}</div>
                </div>
              </li>
            );
          })}
        </ol>
        {run.current_step && (
          <p className="mt-2 text-xs font-mono text-muted-foreground">
            Current step: {run.current_step}
          </p>
        )}
      </div>

      {awaitingConfirm && !autoGates && !run.gate_1_confirmed && (
        <button
          type="button"
          disabled={acting !== null}
          onClick={() => handleAction("confirm")}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm btn-primary"
        >
          {acting === "confirm" ? "Confirming…" : "Confirm spec (Gate 1)"}
        </button>
      )}

      {awaitingApprove && !autoGates && !run.gate_2_approved && (
        <button
          type="button"
          disabled={acting !== null}
          onClick={() => handleAction("approve")}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm btn-primary"
        >
          {acting === "approve" ? "Approving…" : "Approve PR (Gate 2)"}
        </button>
      )}

      {run.outputs?.pr_url && (
        <a
          href={run.outputs.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-agent-cyan hover:underline"
        >
          <ExternalLink className="h-4 w-4" /> View PR
        </a>
      )}

      {run.outputs?.gold_s3_uri && (
        <p className="text-xs font-mono text-muted-foreground break-all">
          Gold: {run.outputs.gold_s3_uri}
        </p>
      )}

      {run.outputs?.emr_job_flow_id && (
        <p className="text-xs font-mono text-muted-foreground">
          EMR: {run.outputs.emr_job_flow_id}
        </p>
      )}

      {(isComplete || deliveryDone || Boolean(resultPreview?.rows?.length) || getStepState("execute") === "done") && (
        <DeliveryResults
          runId={runId}
          preview={resultPreview}
          complete={isComplete}
          hasReportPdf={hasReportPdf}
          hasProfileHtml={hasProfileHtml}
          evaluations={run.evaluations}
          testFiles={run.test_files}
          prUrl={run.outputs?.pr_url}
          deliveryPhase={run.outputs?.delivery_phase}
        />
      )}
    </div>
  );
}
