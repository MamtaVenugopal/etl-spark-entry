# Show the output report in Lovable

The API returns a full report on every `GET /runs/{run_id}`. Use the **`report`** field (easiest) or `parsed_spec` + `evaluations`.

## 1. Poll until status updates

After `POST /stories`, poll every 2–3s until `status` is one of:

- `AWAITING_CONFIRMATION` → show Gate 1 + **report**
- `AWAITING_PR_APPROVAL` → show Gate 2 + PR link (after **pr** step; worker runs: coding → pr → execute → profile → deploy)
- `COMPLETE` → show final **report**
- `FAILED` → show `error`

```ts
const stop = pollRun(runId, (run) => {
  setRun(run);
  setStatus(run.status);
});
```

## 2. Bind the report panel

```tsx
{run?.report && (
  <div className="rounded border p-4 space-y-4">
    <h3>ETL Spec (Agent 1)</h3>
    <p><b>Target:</b> {run.report.spec.target_table}</p>
    <p><b>Sources:</b> {run.report.spec.source_tables?.join(", ")}</p>
    <ul>
      {run.report.spec.transformations?.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>

    <h3>Agent evaluations</h3>
    {run.report.agents?.map((a) => (
      <div key={a.agent}>
        {a.passed ? "✅" : "❌"} {a.agent}: {a.summary}
      </div>
    ))}

    {run.report.artifacts?.pr_url && (
      <p>
        <a href={run.report.artifacts.pr_url} target="_blank" rel="noreferrer">
          View Pull Request
        </a>
        {run.report.artifacts?.pr_merged != null && (
          <span> — merged: {String(run.report.artifacts.pr_merged)}</span>
        )}
      </p>
    )}

    {run.report?.profile_report && (
      <>
        <h3>Data profile (Agent 4)</h3>
        <p>Rows: {run.report.profile_report.row_count}</p>
      </>
    )}
  </div>
)}
```

## 3. Gate 1 — manual vs automated

Call `GET /health` once at app load. If `auto_gate_1` and `auto_gate_2` are **true**, **do not show** Confirm / Approve buttons.

**Automated (recommended):** backend `.env` has `AUTO_GATE_1=true` and `AUTO_GATE_2=true`.

**UI auto-call (optional fallback):** on each poll, if NOT auto from health:

```ts
if (run.status === "AWAITING_CONFIRMATION" && run.evaluations?.task_breakdown?.passed) {
  await fetch(`${API_BASE}/runs/${run.run_id}/confirm`, { method: "POST" });
}
if (run.status === "AWAITING_PR_APPROVAL" && run.evaluations?.pr?.passed) {
  await fetch(`${API_BASE}/runs/${run.run_id}/approve`, { method: "POST" });
}
```

Manual only when `health.auto_gate_1 === false`.

## 4. Download PDF report

```tsx
import { downloadReportPdf, reportPdfUrl } from "@/lib/api";

<button type="button" onClick={() => downloadReportPdf(run.run_id, run.story_id)}>
  Download PDF report
</button>
// Or open in new tab:
<a href={reportPdfUrl(run.run_id)} target="_blank" rel="noreferrer">Open PDF</a>
```

## 5. Gate 2 — merges PR on GitHub

`approveGate2(runId)` calls `POST /runs/{id}/approve`, which **merges the PR** then continues deploy.

Show: `run.outputs.pr_merged` and `run.outputs.pr_merge_message` after approve.

## 6. Verify API has report (curl)

```bash
curl -s http://127.0.0.1:8000/runs/YOUR_RUN_ID | python3 -m json.tool | head -80
```

Look for `"report": { "spec": {...}, "agents": [...], "artifacts": {...} }`.

## Common “nothing displayed” causes

| Symptom | Fix |
|---------|-----|
| UI stuck on `PENDING` | Add polling (`GET /runs/{id}` every 3s) |
| Steps done but no report | Render `run.report` or `run.parsed_spec` |
| Gate 1 never shown | Check `status === "AWAITING_CONFIRMATION"` |
| PR link missing | Approve Gate 2; check `run.outputs.pr_url` |
