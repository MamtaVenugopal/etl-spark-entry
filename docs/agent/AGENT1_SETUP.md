# Agent 1 — Task Breakdown + Evaluation (Mode A)

**Date:** May 16, 2026  
**Stack:** OpenAI + LangChain + Pydantic + rule-based Evaluation Agent  

**AWS target (current):** MWAA + EMR + S3 Parquet bronze/gold + Glue catalog. See **[AGENT1_AWS.md](./AGENT1_AWS.md)**.

---

## Does the evaluation thought process work?

**Yes.** Recommended pattern:

```text
Agent N runs  →  Evaluation Agent (step N)  →  pass? continue : FAILED
                      ↓
              Mode A: human Gate (Confirm / Approve)
```

| Layer | Role |
|-------|------|
| **Task Breakdown Agent** | Produces `ETLSpec` (plan) |
| **Evaluation Agent** | Routes to per-agent evaluators; today implements **task_breakdown** only |
| **SpecEvaluator** | Rule-based: gold target, allowed prefixes, min criteria, no DROP |
| **SchemaRAGEvaluator** | FAISS + `schema_chunks.json`: tables/columns/categories **do not exist** |
| **Optional LLM review** | `EVAL_USE_LLM=true` — OpenAI critiques the spec |
| **Future** | `coding`, `tests`, `pr`, `deploy` evaluators (stubs return pass) |

Humans at Gate 1 only see plans that **passed automated evaluation**.

---

## RAG schema validation

See **`ARCHITECTURE_RAG.md`**, **`README_FAISS.md`**, and **`README_AGENT1_FAISS.md`** (Docker + database queue poller, no ngrok).

```bash
python scripts/build_schema_index.py   # needs OPENAI_API_KEY
python scripts/run_task_breakdown.py config/stories/invalid/US-INV-001.yaml \
  --story-id US-INV-001 --title "Returns"
```

## Folder layout

```text
data/olist_schema/schema_chunks.json
config/
  stories/US001_monthly_revenue.yaml
  stories/invalid/US-INV-001.yaml
  policies.yaml
src/
  rag/          # FAISS retriever + registry
  evaluators/schema_rag_evaluator.py
  ...
scripts/
  build_schema_index.py
  sync_schema_from_databricks.py
```

---

## Setup (one time)

```bash
cd autonomous-etl-agent
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=sk-...          # required for free-text stories
OPENAI_MODEL=gpt-4o-mini
EVAL_USE_LLM=false             # optional LLM spec review
JIRA_*                           # existing
REDIS_URL=redis://localhost:6379/0
```

---

## Test Agent 1 only (no API)

### YAML fast path (no OpenAI call)

```bash
source venv/bin/activate
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
```

Expect: `"passed": true`, `"source": "yaml"`, `gold.monthly_revenue_summary`.

### Free text (needs OpenAI)

```bash
python scripts/run_task_breakdown.py \
  --story-id US-TEST \
  --title "Q1 Sales" \
  --text "Build quarterly sales summary from olist orders and order items into gold.q1_sales with revenue > 0"
```

---

## End-to-end Mode A (API + worker + Gate 1)

**Terminal 1 — API**

```bash
./scripts/start_api.sh
```

**Terminal 2 — worker**

```bash
./scripts/start_worker.sh
```

**Terminal 3 — submit**

```bash
./scripts/verify_api.sh http://127.0.0.1:8000
```

**Check run** (use `run_id` from output):

```bash
curl -s http://127.0.0.1:8000/runs/<run_id> | python3 -m json.tool
```

Expect:

- `status`: `AWAITING_CONFIRMATION`
- `parsed_spec`: full ETL plan
- `evaluations.task_breakdown.passed`: `true`

**Gate 1 — human confirm**

```bash
curl -X POST http://127.0.0.1:8000/runs/<run_id>/confirm
```

---

## Lovable + ngrok

Same as before: `VITE_API_BASE_URL` → ngrok URL, worker + API running.  
Show `parsed_spec` and `evaluations.task_breakdown` on the run panel at Gate 1.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `OPENAI_API_KEY is not set` | Use YAML file input or set key in `.env` |
| `Evaluation FAILED` | Read `evaluations.task_breakdown.checks` in run JSON |
| Stuck PENDING | Start worker; one worker only |
| target must start with gold | Fix spec / prompt |

---

## Next agents (same pattern)

1. **Coding Agent** → `CodeEvaluator` (files exist, imports valid)
2. **Test Agent** → `TestEvaluator` (pytest results)
3. **PR Agent** → `PrEvaluator` (real PR exists)
4. **Deploy Agent** → `DeployEvaluator` (job succeeded)
