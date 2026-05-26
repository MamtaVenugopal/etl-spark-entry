# Testing the 4-agent pipeline

Pipeline order: **task_breakdown → coding → execute → delivery**  
Delivery sub-phases: profiling → testing → PR → report (PDF).

## Coding join validation (pre-EMR)

The coding agent runs `SparkJoinValidator` on `src/jobs/*.py` before execute. Broken joins (e.g. `product_category_name` before `products`) fail with `status=NEEDS_INFO` and `outputs.blocking_questions`.

Recommended execute env (in `.env`):

```bash
EXECUTE_STRATEGY=emr
EXECUTE_SKIP_EMR=false
EXECUTE_LOCAL_SPARK_FIRST=false
EXECUTE_EMR_IF_GOLD_MISSING=true
GLUE_REGISTER_MODE=schema
```

After successful execute, check locations:

```bash
curl -s "$API/runs/$RUN_ID" | jq '{gold_s3_uri, glue_table_fqn, glue_columns, emr_job_flow_id}'
```

## 1. Backend (local Docker)

```bash
cd autonomous-etl-agent
docker compose up -d
docker compose restart api worker
```

Required env (`.env` or `docker-compose.yml`):

| Variable | Purpose |
|----------|---------|
| `PUBLIC_API_BASE_URL` | Customer/Jira link base (e.g. ngrok `https://….ngrok-free.app`) |
| `GLUE_REGISTER_MODE=schema` | Register Glue from `TABLE_SCHEMAS` (default) |
| `EXECUTE_ALLOW_EMR=true` | Allow EMR materialize |
| `AUTO_GATE_1=true` | Skip manual spec confirm when checks pass |
| `AUTO_GATE_2=false` | Manual PR approve in UI (set `true` to auto-merge) |

### Smoke test (curl)

```bash
export API=http://localhost:8000
export PUBLIC_API_BASE_URL=https://YOUR-NGROK.ngrok-free.app   # same host browser uses

# Health
curl -s "$API/health" | jq .

# Submit a story (example US-001 body — use your story file)
# Submit (endpoint is POST /stories — not /stories/submit)
STORY=$(python3 -c "import json; print(json.dumps(open('docs/agent/US001_monthly_revenue.yaml').read()))")
curl -s -X POST "$API/stories" \
  -H "Content-Type: application/json" \
  -d "{\"story_id\":\"US-001\",\"title\":\"Monthly Revenue Summary\",\"content\":$STORY}" | jq .

# Poll (set RUN_ID from the response above)
export RUN_ID=3b0c2062-fff0-435b-9c20-0f6e088c3192
curl -s "$API/runs/$RUN_ID" | jq '{status, customer_run_url, steps: [.steps[].name], current_step}'

# Report is nested under .report on GET /runs/{id} (no separate /report route)
curl -s "$API/runs/$RUN_ID" | jq '.report | {pipeline_passed, customer_run_url, delivery_phase, lineage, agents: [.agents[].agent]}'
```

Expected step names in `steps`: `task_breakdown`, `coding`, `execute`, `delivery` (not the old 6-step names for new runs).

### Gate 2 (PR)

When status is `AWAITING_PR_APPROVAL`:

```bash
curl -s -X POST "$API/runs/RUN_ID/approve" -H "Content-Type: application/json"
```

### Logs

```bash
docker compose logs -f worker api
```

## 2. Lovable UI (etl-spark-entry)

1. Set **`VITE_API_BASE_URL`** to the **same public URL** as `PUBLIC_API_BASE_URL` (ngrok), not `localhost`.
2. Rebuild/redeploy Lovable after env change.
3. Ship a story → open run status:
   - 4 pipeline chips: Spec / Code / Execute / Deliver
   - Customer run link card (copy for Jira)
   - Audit tab: lineage, downloads, agents
4. If you still see 6 steps, Lovable cloud may be ahead/behind local repo — compare with this repo’s `RunStatus.tsx`.

Local dev:

```bash
cd etl-spark-entry
npm install
VITE_API_BASE_URL=https://YOUR-NGROK.ngrok-free.app npm run dev
```

## 3. Test both stacks

| Check | Backend API | Lovable |
|-------|-------------|---------|
| Submit story | `POST /stories` | Ship to Agent |
| 4 steps | `GET /runs/{id}` → `steps` | Pipeline row |
| Execute before delivery | `execute` step `done` before `delivery` runs | Execute chip green first |
| Customer link | `customer_run_url` on run + report | Link card |
| Glue lineage | `GET /runs/{id}/report` → `lineage` | Audit tab |
| Gate 1 | `AUTO_GATE_1` or Confirm in UI | Confirm spec |
| Gate 2 | Approve endpoint or `AUTO_GATE_2` | Approve PR |
| PDFs | `/runs/{id}/report.pdf`, `profile.html` | Download buttons |

## 4. Validate-only execute (fast check)

After gold exists on S3:

```bash
curl -s -X POST "$API/runs/RUN_ID/execute/validate"  # if exposed
# or re-run full pipeline with story that only validates
```

## 5. Troubleshooting

- **Failed to fetch** in browser: `VITE_API_BASE_URL` must be HTTPS ngrok; add `ngrok-skip-browser-warning` header (UI already sends it).
- **Worker stuck on old 6 steps**: Redis may have an in-flight run from before deploy — wait or flush Redis volume for dev.
- **Execute fails locally**: set `EXECUTE_ALLOW_EMR=true` and AWS creds on worker container.
- **Jira link missing**: set `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_ENABLED=true`.
