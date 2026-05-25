# End-to-end test + Lovable setup

## Part A — Backend (your Mac)

### 1. `.env` checklist

```env
DATA_PLATFORM=aws
EXECUTE_SKIP_EMR=true
AUTO_GATE_1=true
AUTO_GATE_2=true

# AWS (you already have these)
AWS_REGION=us-west-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_DATA_BUCKET=olist-ecommerce-raw-2026
ATHENA_OUTPUT_S3=s3://olist-ecommerce-raw-2026/athena-results/
GLUE_DATABASE_GOLD=gold

# GitHub PR step
GITHUB_TOKEN=...
GITHUB_REPO=MamtaVenugopal/etl-spark-entry
GITHUB_BASE_BRANCH=main

# Agent 4 — YData Profiling (graphs in HTML)
PROFILE_USE_YDATA=true
PROFILE_MAX_ROWS=10000

# Charts + PDF (Agent 5)
DEPLOY_CHARTS=true
DEPLOY_WRITE_PDF=true
```

Gold table must already exist (you ran local Spark + `register_gold_glue.py`).

### 2. Start stack

```bash
cd /Users/satta/Desktop/ETL_UserStories/autonomous-etl-agent
docker compose build
docker compose up -d redis api worker
docker compose restart worker   # after code changes
```

Optional: stop `poller` if you are not on Databricks: `docker compose stop poller`

### 3. Smoke test (terminal)

```bash
curl http://127.0.0.1:8000/health
# expect: auto_gate_1 true, auto_gate_2 true

# Submit story (paste YAML body)
curl -X POST http://127.0.0.1:8000/stories \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "story_id": "US-001",
  "title": "Monthly Revenue Summary by Product Category",
  "input_mode": "yaml",
  "content": "story_id: US-001\ntitle: Monthly Revenue Summary by Product Category\nintent: aggregate\ndata_platform: aws\ntarget_table: gold.monthly_revenue_summary\nsource_tables:\n  - olist_orders_raw\n  - olist_order_items_raw\n  - olist_products_raw\n  - olist_category_translation_raw\ntransformations:\n  - join orders to items to products\nacceptance_criteria:\n  - total_revenue > 0 always\n"
}
EOF

# Poll (replace RUN_ID)
curl http://127.0.0.1:8000/runs/RUN_ID

# PDF with charts
curl -o report.pdf http://127.0.0.1:8000/runs/RUN_ID/report.pdf
open report.pdf
```

Wait until `status` is `COMPLETE` (about 2–5 min with skip EMR).

### 4. Worker steps (UI stepper)

| Step | Name | What happens |
|------|------|----------------|
| 1 | task_breakdown | ETLSpec |
| 2 | coding | DAG + Spark job |
| 3 | pr | pytest + GitHub PR (auto-merge if AUTO_GATE_2) |
| 4 | execute | Athena validation (`EXECUTE_SKIP_EMR`) |
| 5 | profile | Profiling metrics |
| 6 | deploy | Sample rows + S3 audit + PDF charts |

---

## Part B — Paste into Lovable chat

Copy everything in the block below into Lovable AI:

---

**Integrate our Autonomous ETL API (FastAPI).**

**Env (Lovable project settings):**
- `VITE_API_BASE_URL` = public URL of our API (ngrok or deployed host), e.g. `https://xxxx.ngrok-free.app` — no trailing slash.

**On load:** `GET {VITE_API_BASE_URL}/health` — store `auto_gate_1`, `auto_gate_2`.

**Submit story:** `POST {VITE_API_BASE_URL}/stories` with JSON:
```json
{
  "story_id": "US-001",
  "title": "Monthly Revenue Summary by Product Category",
  "input_mode": "yaml",
  "content": "<full YAML from US-001 story>"
}
```
Save `run_id`, start polling `GET {VITE_API_BASE_URL}/runs/{run_id}` every 3 seconds until `status` is `COMPLETE`, `FAILED`, `AWAITING_CONFIRMATION`, or `AWAITING_PR_APPROVAL`.

**Step progress UI:** bind to `run.steps` — show 6 steps in order:
`task_breakdown`, `coding`, `pr`, `execute`, `profile`, `deploy` with states `pending` | `running` | `done` | `failed`.

**Report panel:** bind to `run.report`:
- `report.spec` — target, sources, transformations, acceptance_criteria
- `report.agents` — each agent pass/fail + summary
- `report.result_preview` — table sample (columns + rows)
- `report.data_validation` — SQL checks
- `report.profile_report.row_count` if present
- `run.outputs.pr_url` — link “View PR”
- `run.outputs.pr_merged` / `pr_merge_message` after merge

**Gates:**
- If `status === AWAITING_CONFIRMATION` and `!auto_gate_1`: show “Confirm spec” → `POST /runs/{id}/confirm`
- If `status === AWAITING_PR_APPROVAL` and `!auto_gate_2`: show “Approve & merge PR” → `POST /runs/{id}/approve`
- If both auto gates true from `/health`, hide buttons (worker auto-continues).

**On COMPLETE:**
- Show success banner `report.pipeline_passed`
- Button “Download PDF report” → open `{VITE_API_BASE_URL}/runs/{run_id}/report.pdf` in new tab (includes matplotlib charts)
- Show `run.outputs.audit_s3_uri` or `audit_table` if present

**On FAILED:** show `run.error` in red.

Use the API client patterns in `lovable-api-client.example.ts` (poll stops on AWAITING_* and COMPLETE/FAILED).

---

## Part C — Expose API to Lovable (ngrok)

```bash
ngrok http 8000
```

Put the `https://....ngrok-free.app` URL in Lovable as `VITE_API_BASE_URL`, republish preview.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Deploy uses Databricks | Set `DATA_PLATFORM=aws`, `docker compose restart worker` |
| execute skipped | Restart worker after pull; set `EXECUTE_SKIP_EMR=true` |
| Athena schema not found | Run `python scripts/register_gold_glue.py` |
| `TABLE_NOT_FOUND` on new Lovable story | New gold table was never built. With `EXECUTE_SKIP_EMR=true`, set `EXECUTE_EMR_IF_GOLD_MISSING=true` (default) so execute auto-runs EMR once, or run Spark locally then register Glue |
| PR conflicts | Resolve on GitHub, re-run or new story |
| CORS | API must allow Lovable origin (add CORS middleware if browser blocks) |
