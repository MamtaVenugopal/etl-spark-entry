# ETL Spark Entry (local landing + pipelines)

**Local landing app** and **generated ETL artifacts** (PySpark jobs, Airflow DAGs, tests) for the Olist capstone. Agent **prompts** and **setup docs** live in this repo so every README link resolves on GitHub. Run the **FastAPI worker** from sibling [`../autonomous-etl-agent/`](../autonomous-etl-agent/README.md).

| GitHub repo | Contents |
|-------------|----------|
| [**MamtaVenugopal/etl-spark-entry**](https://github.com/MamtaVenugopal/etl-spark-entry) | This repo — UI, jobs, DAGs, `landing/` SPA |
| [**MamtaVenugopal/autonomous-etl-agent**](https://github.com/MamtaVenugopal/autonomous-etl-agent) | API, worker, agents, Docker (local folder `../autonomous-etl-agent/`) |

| Path in this repo | Contents |
|-------------------|----------|
| [`landing/`](landing/) | **Local story intake SPA** — `/intake` + `/runs/:id` ([landing/README.md](landing/README.md)) |
| [`src/components/landing/`](src/components/landing/) | Legacy UI components (historical) |
| [`src/prompts/`](src/prompts/) | LLM prompts (`coding.txt`, `task_breakdown.txt`, …) |
| [`docs/agent/`](docs/agent/) | User stories, execute strategy, EMR setup, `.env.example` |
| [`src/jobs/`](src/jobs/), [`dags/`](dags/), [`config/jobs/`](config/jobs/) | PySpark + Airflow + job YAML (GitHub PR targets) |

**Capstone story:** [US-001 Monthly Revenue Summary](docs/agent/US001_monthly_revenue.yaml) — all 20 stories in [README_USERSTORIES.md](docs/agent/README_USERSTORIES.md).

---

## Table of contents

1. [How the program works](#how-the-program-works)
2. [Architecture](#architecture)
3. [Framework and libraries](#framework-and-libraries)
4. [Pipeline steps and agents](#pipeline-steps-and-agents)
5. [Prompts](#prompts)
6. [Evaluation system](#evaluation-system)
7. [Data platform (AWS)](#data-platform-aws)
8. [API and local landing UI](#api-and-local-landing-ui)
9. [Configuration (.env)](#configuration-env)
10. [Quick start](#quick-start)
11. [Related documentation](#related-documentation)

---

## How the program works

```text
User (local landing/ — this repo)
    │  POST /stories/refine  (local landing — optional)
    │  POST /stories  { story_id, title, content (YAML) }
    ▼
FastAPI (autonomous-etl-agent/src/api/main.py)
    │  creates run in Redis (RunStore)
    │  optional Jira tickets
    ▼
Redis queue  ──►  Worker (autonomous-etl-agent/src/worker.py)
    │
    ├──► 1. task_breakdown   → ETLSpec + evaluation
    ├──► [Gate 1] human or AUTO_GATE_1
    ├──► 2. coding           → PySpark + Airflow DAG + YAML (+ SparkJoinValidator)
    ├──► 3. execute          → Spark (EMR/local) + Athena validation + Glue register
    ▼
GET /runs/{id}  →  status, evaluations, report, error, outputs
```

Each step produces an **`AgentEvaluation`** (`passed`, `score`, `checks[]`, `summary`). If a step fails, the run status becomes **`FAILED`** or **`NEEDS_INFO`** (coding/spec) and `error` / `outputs.blocking_questions` explain why.

Human gates (optional):

| Gate | When | API |
|------|------|-----|
| **Gate 1** | After task breakdown | `POST /runs/{id}/confirm` |
| **Gate 2** | (optional) PR approval | `POST /runs/{id}/approve` (merge PR) |

Set `AUTO_GATE_1=true` and `AUTO_GATE_2=true` in the worker `.env` to skip manual gates when evaluations pass.

**Run statuses:** `QUEUED`, `RUNNING`, `AWAITING_CONFIRMATION`, `AWAITING_PR_APPROVAL`, `NEEDS_INFO`, `COMPLETE`, `FAILED`.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  UI options                                                      │
│  • Local landing/  →  localhost:5173/intake + /runs/:id         │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS → localhost:8000 or ngrok
┌────────────────────────────▼────────────────────────────────────┐
│  api (FastAPI + uvicorn)     redis          worker (Python loop)   │
│  - POST /stories/refine      queue          - 3-agent pipeline     │
│  - submit story              RunStore       - boto3 / GitHub       │
│  - poll run status                         - EMR / local Spark     │
│  - gates, PDF, profile.html (YData)                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   OpenAI API            GitHub API          AWS (S3, Glue, Athena, EMR)
   (LangChain)            → this repo         optional MWAA
```

| Component | Path (local `autonomous-etl-agent/`) | Role |
|-----------|--------------------------------------|------|
| API | `src/api/main.py` | HTTP intake, run status, gates, PDF |
| Worker | `src/worker.py` | Dequeues runs, runs 3-agent pipeline |
| Run store | `src/api/run_store.py` | Redis-backed run state |
| Agents | `src/agents/` | task_breakdown, coding, execute |
| Evaluators | `src/evaluators/` | Rule-based quality checks per step |
| RAG | `src/rag/` | FAISS over schema chunks |
| Services | `src/services/` | EMR, Glue, GitHub, Spark sanitize/repair, SQL |

**Docker Compose:** run `docker compose up` from local `autonomous-etl-agent/`.

---

## Framework and libraries

### Orchestration model

The **worker** is a **deterministic Python loop** over three steps (`task_breakdown` → `coding` → `execute`).

### Where LangChain is used

| Use case | Library | Details |
|----------|---------|---------|
| **LLM calls** | `langchain-openai` `ChatOpenAI` | Agents 1 & 2 (and optional spec critique) |
| **Structured output** | `with_structured_output(ETLSpecLLM)` | Task breakdown → Pydantic model |
| **Messages** | `langchain_core.messages` | `SystemMessage`, `HumanMessage` |
| **Embeddings + FAISS** | `langchain-openai` + `langchain-community` | Schema RAG index |

### Rule-based vs LLM per step

| Step | LLM? | Primary mechanism |
|------|------|-------------------|
| task_breakdown | Optional | YAML fast-path **or** OpenAI + FAISS RAG |
| coding | Yes (default) | OpenAI + sanitize/repair + `SparkJoinValidator` eval retry |
| execute | No | EMR / local Spark + Athena SQL |

---

## Pipeline steps and agents

### Summary table

| Step | Agent module (backend) | Input | Output (run fields) | Prompt |
|------|------------------------|-------|---------------------|--------|
| **task_breakdown** | `task_breakdown_agent.py` | `story_id`, `title`, `content` | `parsed_spec`, `evaluations.task_breakdown` | [task_breakdown.txt](src/prompts/task_breakdown.txt) |
| **coding** | `coding_agent.py` | `ETLSpec` | `generated_files[]`, files on disk | [coding.txt](src/prompts/coding.txt) |
| **execute** | `execute_agent.py` | `ETLSpec`, `generated_files` | `data_validation[]`, `outputs.emr_*`, `gold_s3_uri` | — |

Generated artifacts are committed to **this repo**: [src/jobs/](src/jobs/), [dags/](dags/), [config/jobs/](config/jobs/), [tests/](tests/).

---

### Agent 1 — Task breakdown

| | |
|--|--|
| **Prompt** | [src/prompts/task_breakdown.txt](src/prompts/task_breakdown.txt) |
| **Context** | [docs/agent/aws_platform.yaml](docs/agent/aws_platform.yaml); optional FAISS RAG |
| **Evaluation** | `SpecEvaluator` + `SchemaRAGEvaluator`; optional [spec_evaluation.txt](src/prompts/spec_evaluation.txt) |
| **CLI** (backend) | `python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml` |
| **Story file (this repo)** | [docs/agent/US001_monthly_revenue.yaml](docs/agent/US001_monthly_revenue.yaml) |

---

### Agent 2 — Coding

| | |
|--|--|
| **Prompt** | [src/prompts/coding.txt](src/prompts/coding.txt) |
| **Post-processing** | `spark_job_sanitize.py` (string joins, Column joins, groupBy aliases), `spark_job_repair.py` |
| **Evaluation** | `CodeEvaluator` + `SparkJoinValidator`; eval retry loop (`CODING_EVAL_RETRY_MAX`) |
| **CLI** (backend) | `python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml` |
| **US-001 reference job** | [src/jobs/monthly_revenue_summary.py](src/jobs/monthly_revenue_summary.py), [dags/templates/US001_monthly_revenue_dag.py](dags/templates/US001_monthly_revenue_dag.py) |

---

### Agent 3 — Execute

| | |
|--|--|
| **Execution** | [docs/agent/EXECUTE_STRATEGY.md](docs/agent/EXECUTE_STRATEGY.md) — `smart` / local Spark / EMR |
| **EMR** | [docs/agent/EMR_IAM_SETUP.md](docs/agent/EMR_IAM_SETUP.md) — terminate on success **and** failure by default |
| **Scripts (this repo)** | [scripts/register_gold_glue.py](scripts/register_gold_glue.py), [scripts/fetch_emr_logs.py](scripts/fetch_emr_logs.py) |
| **CLI** (backend) | `python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml` |

```bash
# Manual materialize (from backend clone or this repo with pyspark/boto3)
python scripts/run_spark_job.py --job src/jobs/order_count_by_quarter_product_category.py
python scripts/register_gold_glue.py --table order_count_by_quarter_product_category
```

---

### Outputs (after execute)

After `execute` completes, the run page can show:

- `result_preview` (sample rows)
- `gold_s3_uri` and Glue metadata (if registered)
- Optional artifacts like `GET /runs/{id}/report.pdf` and `GET /runs/{id}/profile.html` when enabled in the backend

---

## Prompts

| File | Used by | Purpose |
|------|---------|---------|
| [task_breakdown.txt](src/prompts/task_breakdown.txt) | TaskBreakdownAgent | Story → `ETLSpec` |
| [coding.txt](src/prompts/coding.txt) | CodingAgent | PySpark + EMR DAG |
| [spec_evaluation.txt](src/prompts/spec_evaluation.txt) | EvaluationAgent | Optional LLM spec critique |

Platform hints: [docs/agent/aws_platform.yaml](docs/agent/aws_platform.yaml) (mirrors backend `config/aws_platform.yaml`).

---

## Evaluation system

| Agent key | Evaluator(s) | Checks (examples) |
|-----------|--------------|-------------------|
| `task_breakdown` | `SpecEvaluator`, `SchemaRAGEvaluator` | gold target, source tables, RAG |
| `coding` | `CodeEvaluator`, `SparkJoinValidator` | syntax, string join keys, groupBy aliases |
| `execute` | `ExecuteEvaluator` | Athena validations, gold on S3 |

---

## Data platform (AWS)

| Layer | Technology |
|-------|------------|
| **Bronze** | CSV on `s3://{bucket}/bronze/raw/` — Glue DB `bronze` |
| **Gold** | Parquet on `s3://{bucket}/gold/{table}/` — Glue DB `gold` |
| **Orchestration** | MWAA (Airflow DAGs in [dags/](dags/)) |
| **Execute** | EMR Spark or local `run_spark_job.py` |
| **Validate** | Amazon **Athena** |
| **Catalog** | AWS **Glue** — [scripts/register_gold_glue.py](scripts/register_gold_glue.py) |

Env template: [docs/agent/.env.example](docs/agent/.env.example) (copy to `.env` in **autonomous-etl-agent**).

---

## API and local landing UI

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/stories/refine` | Raw text → structured story (local `landing/` only) |
| `POST` | `/stories` | Submit story YAML → `run_id` |
| `GET` | `/runs/{run_id}` | Poll status, spec, evaluations, `result_preview`, `report` |
| `POST` | `/runs/{run_id}/confirm` | Gate 1 |
| `POST` | `/runs/{run_id}/approve` | Gate 2 — merge PR |
| `GET` | `/runs/{run_id}/report.pdf` | PDF run report |
| `GET` | `/runs/{run_id}/profile.html` | YData profile HTML |
| `POST` | `/schema/refresh` | Refresh FAISS from Glue |

### UI options

| UI | URL | Config |
|----|-----|--------|
| **Local landing** (recommended dev) | `http://localhost:5173/intake` | `landing/.env` → `VITE_API_BASE_URL=http://localhost:8000` |
| **Vercel hosted landing** (client intake) | `https://<your-app>.vercel.app/intake` | Vercel env → `VITE_API_BASE_URL=https://<your-public-api>` |

**CORS:** backend `ALLOWED_ORIGINS` must include `http://localhost:5173` and `http://localhost:5174` (Vite may use 5174 if 5173 is busy).

**Local landing flow:** free-text → Refine with AI → edit structured story → **Ship to Agent** (opens `/runs/{runId}` in new tab) → run page shows status + results preview.

### Vercel deployment notes (hosted landing)

To share intake with external users, deploy the `landing/` SPA to Vercel and expose your API publicly (Railway/Render/AWS). See [landing/README.md](landing/README.md) for step-by-step.

Important details:

- **Vercel needs an env var**: `VITE_API_BASE_URL=https://YOUR-PUBLIC-API` (set for **Production**, then **Redeploy**).
- **Backend must allow the Vercel origin**: add `https://<your-app>.vercel.app` to `ALLOWED_ORIGINS`.
- If you are using **ngrok** as the API URL, the landing app must fetch `/profile.html` and `/report.pdf` with the `ngrok-skip-browser-warning` header (implemented in `landing/src/lib/api.ts`).

See [landing/README.md](landing/README.md).

**End-to-end test checklist:** [docs/agent/TESTING-4-AGENT.md](docs/agent/TESTING-4-AGENT.md).

---

## Configuration (.env)

Copy [docs/agent/.env.example](docs/agent/.env.example) → `autonomous-etl-agent/.env`. Key groups:

| Group | Variables |
|-------|-----------|
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL`, `EVAL_USE_LLM` |
| **AWS** | `AWS_REGION`, `S3_DATA_BUCKET`, `GLUE_DATABASE_*`, `ATHENA_OUTPUT_S3` |
| **EMR** | `EMR_SERVICE_ROLE`, `EMR_EC2_INSTANCE_PROFILE`, `EMR_TERMINATE_ON_SUCCESS`, `EMR_TERMINATE_ON_FAILURE` |
| **Execute** | `EXECUTE_SKIP_EMR`, `EXECUTE_STRATEGY`, `EXECUTE_EMR_IF_GOLD_MISSING` |
| **GitHub** | `GITHUB_TOKEN`, `GITHUB_REPO=MamtaVenugopal/etl-spark-entry` |
| **CORS** | `ALLOWED_ORIGINS=...,http://localhost:5173,http://localhost:5174` |
| **Public run URLs** | `PUBLIC_API_BASE_URL=http://localhost:5173` (landing app origin) |
| **Gates** | `AUTO_GATE_1`, `AUTO_GATE_2` |
| **Coding** | `CODING_EVAL_RETRY_MAX`, `CODING_EVAL_RETRY_ENABLED` |

```env
# Cost control — terminate EMR after success or failure (recommended)
EMR_TERMINATE_ON_SUCCESS=true
EMR_TERMINATE_ON_FAILURE=true
```

---

## Quick start

### 1. Backend (autonomous-etl-agent)

```bash
cd ../autonomous-etl-agent   # or your ETL_UserStories/autonomous-etl-agent path
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill keys; see docs/agent/.env.example in this repo
docker compose up -d redis api worker
```

### 2. Local landing UI (Cursor dev — recommended)

```bash
cd landing
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
# → http://localhost:5173/intake  (or 5174 if 5173 is in use)
```

**Ship to Agent** opens the run tracker in a **new tab**: `/runs/{runId}`.

Ensure backend CORS includes your Vite port — see [landing/README.md](landing/README.md).

### 3. US-001 demo (backend CLI)

```bash
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml
python scripts/run_spark_job.py --job src/jobs/monthly_revenue_summary.py
python scripts/register_gold_glue.py --table monthly_revenue_summary
python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml --skip-emr
```

### 4. Submit from UI

**Local landing:** refine story on `/intake` → Ship to Agent.

**YAML:** paste from [README_USERSTORIES.md](docs/agent/README_USERSTORIES.md); poll `GET /runs/{run_id}`.

---

## Related documentation

| Document | Topic |
|----------|--------|
| [README_USERSTORIES.md](docs/agent/README_USERSTORIES.md) | All 20 user stories + YAML |
| [landing/README.md](landing/README.md) | Local intake + run status SPA |
| [docs/agent/TESTING-4-AGENT.md](docs/agent/TESTING-4-AGENT.md) | Curl test checklist (doc name is legacy) |
| [EXECUTE_STRATEGY.md](docs/agent/EXECUTE_STRATEGY.md) | EMR vs local vs validate-only |
| [EMR_IAM_SETUP.md](docs/agent/EMR_IAM_SETUP.md) | EMR + Glue IAM roles |
| [ERROR_LOGS.md](docs/agent/ERROR_LOGS.md) | Failures (API, S3, EMR) |
| [AGENT1_SETUP.md](docs/agent/AGENT1_SETUP.md) | Task breakdown + FAISS setup |
| [README_AGENT1_FAISS.md](docs/agent/README_AGENT1_FAISS.md) | Schema RAG deep dive |
| [AWS_AGENT_PIPELINE.md](docs/agent/AWS_AGENT_PIPELINE.md) | AWS-specific notes |

---

## Project layout (this repo)

```text
etl-spark-entry/
├── landing/                  # Local Vite SPA (/intake, /runs/:id) — on GitHub main
│   └── src/components/       # StoryIntakeForm, RunTracker, DeliveryResults
├── src/
│   ├── components/landing/   # Legacy UI components (historical)
│   ├── jobs/                 # PySpark gold pipelines
│   └── prompts/              # LLM prompts
├── dags/                     # Airflow / EMR DAGs
├── config/jobs/              # Job YAML metadata
├── tests/                    # Structural pytest
├── scripts/                  # register_gold_glue.py, fetch_emr_logs.py
└── docs/agent/               # User stories, .env.example, runbooks
```

**Backend (sibling repo):** [autonomous-etl-agent](../autonomous-etl-agent/README.md) — FastAPI, worker, `docker-compose.yml`, agents, services.

---

## License / context

Autonomous ETL capstone: **user story → spec → code → execute on AWS**, with optional gates and a landing intake UI.
