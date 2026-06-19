# ETL Spark Entry (local landing + pipelines)

**Local landing app** and **generated ETL artifacts** (PySpark jobs, Airflow DAGs, tests) for the Olist capstone. Agent **prompts** and **setup docs** live in this repo so every README link resolves on GitHub. Run the **FastAPI worker** from sibling [`autonomous-etl-agent`](https://github.com/MamtaVenugopal/autonomous-etl-agent).

| GitHub repo | Contents |
|-------------|----------|
| [**MamtaVenugopal/etl-spark-entry**](https://github.com/MamtaVenugopal/etl-spark-entry) | This repo — UI, jobs, DAGs, `landing/` SPA, mirrored prompts |
| [**MamtaVenugopal/autonomous-etl-agent**](https://github.com/MamtaVenugopal/autonomous-etl-agent) | API, worker, agents, Docker (local folder `../autonomous-etl-agent/`) |

| Path in this repo | Contents |
|-------------------|----------|
| [`landing/`](landing/) | **Local story intake SPA** — `/intake` + `/runs/:id` ([landing/README.md](landing/README.md)) |
| [`src/prompts/`](src/prompts/) | LLM prompts (mirrored from backend; worker reads backend copy) |
| [`docs/agent/`](docs/agent/) | User stories, execute strategy, EMR setup, `.env.example` |
| [`src/jobs/`](src/jobs/), [`dags/`](dags/), [`config/jobs/`](config/jobs/) | PySpark + Airflow + job YAML (GitHub PR targets) |

**Capstone story:** [US-001 Monthly Revenue Summary](docs/agent/US001_monthly_revenue.yaml) — all 20 stories in [README_USERSTORIES.md](docs/agent/README_USERSTORIES.md).

---

## Table of contents

1. [How the program works](#how-the-program-works)
2. [Architecture](#architecture)
3. [Framework and libraries](#framework-and-libraries)
4. [Agents and pipeline steps](#agents-and-pipeline-steps)
5. [Prompts](#prompts)
6. [Evaluation system](#evaluation-system)
7. [Final delivery outputs](#final-delivery-outputs)
8. [Data platform (AWS)](#data-platform-aws)
9. [API and local landing UI](#api-and-local-landing-ui)
10. [Configuration (.env)](#configuration-env)
11. [Quick start](#quick-start)
12. [Related documentation](#related-documentation)

---

## How the program works

```text
User (landing/ — this repo)
    │  POST /stories/refine     free text → structured story (optional)
    │  POST /stories/validate   rule + LLM story checks (optional)
    │  POST /stories            { story_id, title, content (YAML) }
    ▼
FastAPI (autonomous-etl-agent/src/api/main.py)
    │  creates run in Redis (RunStore)
    │  optional Jira tickets
    ▼
Redis queue  ──►  Worker (autonomous-etl-agent/src/worker.py)
    │
    ├──► 1. task_breakdown   → ETLSpec + evaluation          [Agent 1]
    ├──► [Gate 1] human or AUTO_GATE_1
    ├──► 2. coding           → PySpark + Airflow + YAML    [Agent 2]
    ├──► 3. execute          → EMR/local Spark + Athena    [Agent 3]
    └──► 4. delivery         → profile → tests → PR → PDF  [Agent 4]
              ├── profiling   (YData + SQL smoke)
              ├── testing     (story PR tests + pytest)
              ├── pr          (GitHub PR + optional merge)
              └── report      (deploy sample + chart selection + audit)
    ▼
GET /runs/{id}  →  status, evaluations, report, chart_profile, downloads
GET /runs/{id}/report.pdf  →  Final delivery PDF
```

Each step produces an **`AgentEvaluation`** (`passed`, `score`, `checks[]`, `summary`). If a step fails, the run status becomes **`FAILED`** or **`NEEDS_INFO`** (coding/spec) and `error` / `outputs.blocking_questions` explain why.

Human gates (optional):

| Gate | When | API |
|------|------|-----|
| **Gate 1** | After task breakdown | `POST /runs/{id}/confirm` |
| **Gate 2** | After delivery opens PR (before merge/deploy report) | `POST /runs/{id}/approve` |

Set `AUTO_GATE_1=true` and `AUTO_GATE_2=true` in the worker `.env` to skip manual gates when evaluations pass.

**Run statuses:** `QUEUED`, `RUNNING`, `AWAITING_CONFIRMATION`, `AWAITING_PR_APPROVAL`, `NEEDS_INFO`, `COMPLETE`, `FAILED`.

**Retry:** If execute succeeded but delivery failed, `POST /runs/{id}/retry-delivery` re-runs the delivery step only.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  UI options                                                      │
│  • Local landing/  →  localhost:5173/intake + /runs/:id         │
│  • Vercel hosted   →  VITE_API_BASE_URL → public API (ngrok/AWS) │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS → localhost:8000 or ngrok
┌────────────────────────────▼────────────────────────────────────┐
│  api (FastAPI + uvicorn)     redis          worker (Python loop)   │
│  - refine / validate story   queue          - 4-step pipeline     │
│  - submit story              RunStore       - boto3 / GitHub       │
│  - poll run status                         - EMR / local Spark     │
│  - gates, PDF, profile.html, retry-delivery                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   OpenAI API            GitHub API          AWS (S3, Glue, Athena, EMR)
   (LangChain)            → this repo         optional MWAA
```

| Component | Path ([autonomous-etl-agent](https://github.com/MamtaVenugopal/autonomous-etl-agent)) | Role |
|-----------|----------------------------------------------------------------------------------------|------|
| API | `src/api/main.py` | HTTP intake, validation, run status, gates, PDF |
| Worker | `src/worker.py` | Dequeues runs; runs 4-step pipeline |
| Run store | `src/api/run_store.py` | Redis-backed run state |
| Agents | `src/agents/` | See [Agents and pipeline steps](#agents-and-pipeline-steps) |
| Evaluators | `src/evaluators/` | Rule-based quality checks per step |
| RAG | `src/rag/` | FAISS over Glue schema chunks |
| Services | `src/services/` | EMR, Glue, GitHub, charts, PDF, SQL |

**Docker Compose:** run `docker compose up` from local `autonomous-etl-agent/`.

---

## Framework and libraries

### Orchestration model

The **worker** is a **deterministic Python loop** over four steps:

`task_breakdown` → `coding` → `execute` → `delivery`

The **delivery** step orchestrates profile, testing, PR, and deploy sub-phases in one worker step (legacy 6-step runs with separate `pr` / `profile` / `deploy` are still supported for old queued runs).

### Where LangChain is used

| Use case | Library | Details |
|----------|---------|---------|
| **LLM calls** | `langchain-openai` `ChatOpenAI` | Agents 1–2, story validation, chart selection, optional spec/PR-test assist |
| **Structured output** | `with_structured_output(...)` | Task breakdown → `ETLSpec`; refine → `StructuredStory`; chart → `ChartProfile` |
| **Messages** | `langchain_core.messages` | `SystemMessage`, `HumanMessage` |
| **Embeddings + FAISS** | `langchain-openai` + `langchain-community` | Schema RAG index |

### Rule-based vs LLM per step

| Step / agent | LLM? | Primary mechanism |
|--------------|------|-------------------|
| story refine (intake) | Yes | Inline system prompt in `story_refine.py` |
| story validation (intake) | Optional | `StorySpecEvaluator` rules + optional [story_validation.txt](src/prompts/story_validation.txt) |
| task_breakdown | Optional | YAML fast-path **or** OpenAI + FAISS RAG |
| coding | Yes (default) | OpenAI + sanitize/repair + `SparkJoinValidator` eval retry |
| execute | No | EMR / local Spark + Athena SQL |
| profile | No | YData Profiling + SQL smoke metrics |
| story PR tests | Optional | Template generator + optional [story_pr_test.txt](src/prompts/story_pr_test.txt) |
| tests (pytest) | No | Structural pytest on generated job/DAG |
| pr | No | GitHub API + `PrEvaluator` |
| deploy / PDF charts | Optional | Athena/S3 sample + [chart_selection.txt](src/prompts/chart_selection.txt) or rules |

---

## Agents and pipeline steps

### Summary table

| # | Worker step / agent | Backend module | Prompt file | Primary output |
|---|---------------------|----------------|-------------|----------------|
| — | **Story refine** (intake) | `services/story_refine.py` | *(inline system prompt)* | Structured story for landing UI |
| — | **Story validation** (intake) | `story_validation_agent.py` | [story_validation.txt](src/prompts/story_validation.txt) | `passed`, `score`, `checks`, `suggested_fixes` |
| **1** | **task_breakdown** | `task_breakdown_agent.py` | [task_breakdown.txt](src/prompts/task_breakdown.txt) | `parsed_spec`, `evaluations.task_breakdown` |
| | *(spec critique)* | `evaluation_agent.py` | [spec_evaluation.txt](src/prompts/spec_evaluation.txt) | Optional LLM review when `EVAL_USE_LLM=true` |
| **2** | **coding** | `coding_agent.py` | [coding.txt](src/prompts/coding.txt) | `generated_files[]` (job, DAG, YAML) |
| **3** | **execute** | `execute_agent.py` | — | `data_validation[]`, `outputs.emr_*`, `gold_s3_uri` |
| **4** | **delivery** (composite) | `delivery_agent.py` | — | `result_preview`, `chart_profile`, PR, PDF assets |
| 4a | ↳ profile | `profile_agent.py` | — | `outputs.profile_report`, YData HTML |
| 4b | ↳ story PR tests | `story_pr_test_agent.py` | [story_pr_test.txt](src/prompts/story_pr_test.txt) | Generated pytest under `tests/generated/` |
| 4c | ↳ structural tests | `test_agent.py` | — | `evaluations.tests`, `test_files` |
| 4d | ↳ GitHub PR | `pr_agent.py` | — | `outputs.pr_url`, `pr_branch` |
| 4e | ↳ deploy + report | `deploy_agent.py` | — | `result_preview`, audit row, chart metadata |
| 4f | ↳ chart selection | `chart_selection_agent.py` | [chart_selection.txt](src/prompts/chart_selection.txt) | `outputs.chart_profile` (bar/line/3D surface) |

Generated artifacts are committed to **this repo**: [src/jobs/](src/jobs/), [dags/](dags/), [config/jobs/](config/jobs/), [tests/](tests/).

---

### Intake — Story refine (pre-worker)

| | |
|--|--|
| **API** | `POST /stories/refine` |
| **Module** | `autonomous-etl-agent/src/services/story_refine.py` |
| **Prompt** | Inline system prompt (Olist bronze/gold naming, acceptance-criteria grain) |
| **Output** | `StructuredStoryResponse` — title, as_a / i_want / so_that, source_tables, target_table |

Used by the landing **Refine with AI** button before **Ship to Agent**.

---

### Intake — Story validation (pre-worker)

| | |
|--|--|
| **API** | `POST /stories/validate` |
| **Module** | `story_validation_agent.py` |
| **Prompt** | [src/prompts/story_validation.txt](src/prompts/story_validation.txt) |
| **Evaluation** | `StorySpecEvaluator` (source tables, gold grain, join chain, acceptance SQL) + optional LLM review |
| **Output** | `passed`, `score`, `checks[]`, `suggested_fixes` |

---

### Agent 1 — Task breakdown (`task_breakdown`)

| | |
|--|--|
| **Prompt** | [src/prompts/task_breakdown.txt](src/prompts/task_breakdown.txt) |
| **Context** | [docs/agent/aws_platform.yaml](docs/agent/aws_platform.yaml); optional FAISS schema RAG |
| **Evaluation** | `SpecEvaluator` + `SchemaRAGEvaluator`; optional [spec_evaluation.txt](src/prompts/spec_evaluation.txt) |
| **CLI** (backend) | `python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml` |
| **Story file** | [docs/agent/US001_monthly_revenue.yaml](docs/agent/US001_monthly_revenue.yaml) |

---

### Agent 2 — Coding (`coding`)

| | |
|--|--|
| **Prompt** | [src/prompts/coding.txt](src/prompts/coding.txt) |
| **Post-processing** | `spark_job_sanitize.py`, `spark_job_repair.py`, `SparkJoinValidator` |
| **Evaluation** | `CodeEvaluator`; eval retry loop (`CODING_EVAL_RETRY_MAX`) |
| **CLI** (backend) | `python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml` |
| **US-001 reference** | [src/jobs/monthly_revenue_summary.py](src/jobs/monthly_revenue_summary.py) |

---

### Agent 3 — Execute (`execute`)

| | |
|--|--|
| **Execution** | [docs/agent/EXECUTE_STRATEGY.md](docs/agent/EXECUTE_STRATEGY.md) — `smart` / local Spark / EMR |
| **EMR** | [docs/agent/EMR_IAM_SETUP.md](docs/agent/EMR_IAM_SETUP.md) — terminate on success **and** failure by default |
| **Evaluation** | `ExecuteEvaluator` — Athena validations, gold on S3 |
| **CLI** (backend) | `python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml` |

```bash
# Manual materialize (from backend clone or this repo with pyspark/boto3)
python scripts/run_spark_job.py --job src/jobs/order_count_by_quarter_product_category.py
python scripts/register_gold_glue.py --table order_count_by_quarter_product_category
```

---

### Agent 4 — Delivery (`delivery`)

Runs **after execute** has materialized gold on S3 and registered Glue. Sub-phases:

| Phase | `delivery_phase` | What happens |
|-------|------------------|--------------|
| **Profiling** | `profiling` | YData HTML + SQL smoke; `ProfileEvaluator` |
| **Testing** | `testing` | `StoryPRTestAgent` generates story-aware pytest → `TestAgent` runs structural tests |
| **PR** | `pr` | `PrAgent` opens GitHub PR; **Gate 2** unless `AUTO_GATE_2` |
| **Report** | `report` | `DeployAgent` samples gold, re-validates SQL, audit row, **Chart Selection Agent**, PDF assets |

Skip PR in dev: `GITHUB_SKIP_PR=true` (jumps to deploy/report).

---

### Chart Selection Agent (inside deploy / PDF)

| | |
|--|--|
| **Module** | `chart_selection_agent.py` |
| **Prompt** | [src/prompts/chart_selection.txt](src/prompts/chart_selection.txt) |
| **Rule fallback** | `services/chart_selection.py` when `CHART_SELECTION_USE_LLM=false` |
| **Chart types** | `bar`, `line`, `horizontal_bar`, `surface_3d` (payment × time × metric stories) |
| **Used by** | Landing `DeliveryResults`, `GET /runs/{id}/report.pdf` |

---

## Prompts

All prompt `.txt` files are mirrored in **this repo** under [`src/prompts/`](src/prompts/). The worker reads the copies in **autonomous-etl-agent** (keep both in sync when editing).

| File | Agent / service | Purpose |
|------|-----------------|---------|
| [task_breakdown.txt](src/prompts/task_breakdown.txt) | `TaskBreakdownAgent` | Story YAML/text → `ETLSpec` |
| [coding.txt](src/prompts/coding.txt) | `CodingAgent` | PySpark job + EMR Airflow DAG |
| [spec_evaluation.txt](src/prompts/spec_evaluation.txt) | `EvaluationAgent` | Optional LLM spec critique (`EVAL_USE_LLM`) |
| [story_validation.txt](src/prompts/story_validation.txt) | `StoryValidationAgent` | Intake story review before Ship |
| [story_pr_test.txt](src/prompts/story_pr_test.txt) | `StoryPRTestAgent` | Optional LLM-assisted PR acceptance pytest (`STORY_PR_TEST_USE_LLM`) |
| [chart_selection.txt](src/prompts/chart_selection.txt) | `ChartSelectionAgent` | Chart type + axes for delivery UI and PDF (`CHART_SELECTION_USE_LLM`) |
| *(inline)* | `story_refine.py` | Free-text → structured intake story (no `.txt` file) |

Platform hints: [docs/agent/aws_platform.yaml](docs/agent/aws_platform.yaml) (mirrors backend `config/aws_platform.yaml`).

---

## Evaluation system

| Evaluation key | Evaluator(s) | Checks (examples) |
|----------------|--------------|-------------------|
| `story_validation` | `StorySpecEvaluator` (+ optional LLM) | source tables, gold grain, join chain, acceptance SQL |
| `task_breakdown` | `SpecEvaluator`, `SchemaRAGEvaluator` | gold target, allowed tables, RAG coverage |
| `coding` | `CodeEvaluator`, `SparkJoinValidator` | syntax, string join keys, groupBy aliases |
| `execute` | `ExecuteEvaluator` | Athena validations, gold on S3 |
| `profile` | `ProfileEvaluator` | YData HTML path, smoke metrics |
| `tests` | `TestEvaluator` | structural pytest pass |
| `pr` | `PrEvaluator` | PR opened, files committed |
| `deploy` | `DeployEvaluator` | sample rows, acceptance SQL, audit |
| `delivery` | composite | all delivery sub-phases passed |

---

## Final delivery outputs

When a run reaches **`COMPLETE`**, the run page and PDF bundle include:

| Artifact | Description | Access |
|----------|-------------|--------|
| **Business sample** | Top rows from gold table | `run.result_preview`, PDF table section |
| **Story-aware chart** | Bar, line, or 3D surface with axes + legend | `run.outputs.chart_profile`, landing `DeliveryResults` |
| **YData profiling** | Full HTML (distributions, correlations) | `GET /runs/{id}/profile.html` |
| **Final delivery PDF** | Spec + sample + chart selection + matplotlib charts + validation + agent scores | `GET /runs/{id}/report.pdf` |
| **Audit JSON** | Run lineage | `s3://.../audit/etl_run_reports/{run_id}.json` |

PDF is built by `autonomous-etl-agent/src/api/report_pdf.py` using the Chart Selection Agent and `delivery_report_pdf.py`.

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
| `POST` | `/stories/refine` | Raw text → structured story (landing intake) |
| `POST` | `/stories/validate` | Validate structured story before submit |
| `POST` | `/stories` | Submit story YAML → `run_id` |
| `GET` | `/runs/{run_id}` | Poll status, spec, evaluations, `result_preview`, `report`, `chart_profile` |
| `POST` | `/runs/{run_id}/confirm` | Gate 1 — confirm spec |
| `POST` | `/runs/{run_id}/approve` | Gate 2 — merge PR |
| `POST` | `/runs/{run_id}/retry-delivery` | Retry delivery after execute succeeded |
| `GET` | `/runs/{run_id}/report.pdf` | **Final delivery PDF** |
| `GET` | `/runs/{run_id}/profile.html` | YData profile HTML |
| `POST` | `/schema/refresh` | Refresh FAISS from Glue |

### UI options

| UI | URL | Config |
|----|-----|--------|
| **Local landing** (recommended dev) | `http://localhost:5173/intake` | `landing/.env` → `VITE_API_BASE_URL=http://localhost:8000` |
| **Vercel hosted landing** | `https://<your-app>.vercel.app/intake` | Vercel env → `VITE_API_BASE_URL=https://<your-public-api>` |

**CORS:** backend `ALLOWED_ORIGINS` must include `http://localhost:5173` and `http://localhost:5174`.

**Local landing flow:** free-text → Refine with AI → validate (optional) → **Ship to Agent** → `/runs/{runId}` shows step progress, chart, YData link, **Download PDF**.

If using **ngrok**, fetch `/profile.html` and `/report.pdf` with the `ngrok-skip-browser-warning` header (implemented in `landing/src/lib/api.ts`).

See [landing/README.md](landing/README.md) and [docs/agent/TESTING-4-AGENT.md](docs/agent/TESTING-4-AGENT.md).

---

## Configuration (.env)

Copy [docs/agent/.env.example](docs/agent/.env.example) → `autonomous-etl-agent/.env`. Key groups:

| Group | Variables |
|-------|-----------|
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL`, `EVAL_USE_LLM` |
| **Story intake** | `STORY_VALIDATION_USE_LLM` (optional LLM review on validate) |
| **Charts** | `CHART_SELECTION_USE_LLM`, `CHART_PROFILE_ENABLED` |
| **PR tests** | `STORY_PR_TEST_ENABLED`, `STORY_PR_TEST_USE_LLM` |
| **Profiling** | `PROFILE_USE_YDATA` |
| **AWS** | `AWS_REGION`, `S3_DATA_BUCKET`, `GLUE_DATABASE_*`, `ATHENA_OUTPUT_S3` |
| **EMR** | `EMR_SERVICE_ROLE`, `EMR_EC2_INSTANCE_PROFILE`, `EMR_TERMINATE_ON_SUCCESS`, `EMR_TERMINATE_ON_FAILURE` |
| **Execute** | `EXECUTE_SKIP_EMR`, `EXECUTE_STRATEGY`, `EXECUTE_EMR_IF_GOLD_MISSING` |
| **GitHub** | `GITHUB_TOKEN`, `GITHUB_REPO=MamtaVenugopal/etl-spark-entry`, `GITHUB_SKIP_PR` |
| **CORS** | `ALLOWED_ORIGINS=...,http://localhost:5173,http://localhost:5174` |
| **Gates** | `AUTO_GATE_1`, `AUTO_GATE_2` |
| **Coding** | `CODING_EVAL_RETRY_MAX`, `CODING_EVAL_RETRY_ENABLED` |

```env
EMR_TERMINATE_ON_SUCCESS=true
EMR_TERMINATE_ON_FAILURE=true
```

---

## Quick start

### 1. Backend (autonomous-etl-agent)

```bash
cd ../autonomous-etl-agent
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
docker compose up -d redis api worker
```

### 2. Local landing UI

```bash
cd landing
cp .env.example .env
npm install
npm run dev
# → http://localhost:5173/intake
```

### 3. US-001 demo (backend CLI)

```bash
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml
python scripts/run_spark_job.py --job src/jobs/monthly_revenue_summary.py
python scripts/register_gold_glue.py --table monthly_revenue_summary
python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml --skip-emr
```

Full automation: submit from landing → worker runs all four steps including delivery PDF.

### 4. Submit from UI

**Local landing:** refine story on `/intake` → Ship to Agent.

**YAML:** paste from [README_USERSTORIES.md](docs/agent/README_USERSTORIES.md); poll `GET /runs/{run_id}`.

---

## Related documentation

| Document | Topic |
|----------|--------|
| [README_USERSTORIES.md](docs/agent/README_USERSTORIES.md) | All 20 user stories + YAML |
| [AGENT_PIPELINE_OVERVIEW.md](docs/agent/AGENT_PIPELINE_OVERVIEW.md) | Full agent pipeline (4-step worker) |
| [landing/README.md](landing/README.md) | Local intake + run status SPA |
| [TESTING-4-AGENT.md](docs/agent/TESTING-4-AGENT.md) | End-to-end curl checklist |
| [EXECUTE_STRATEGY.md](docs/agent/EXECUTE_STRATEGY.md) | EMR vs local vs validate-only |
| [EMR_IAM_SETUP.md](docs/agent/EMR_IAM_SETUP.md) | EMR + Glue IAM roles |
| [AGENT1_SETUP.md](docs/agent/AGENT1_SETUP.md) | Task breakdown + FAISS setup |
| [autonomous-etl-agent README](https://github.com/MamtaVenugopal/autonomous-etl-agent/blob/main/README.md) | Backend API reference |

---

## Project layout (this repo)

```text
etl-spark-entry/
├── landing/                  # Vite SPA (/intake, /runs/:id)
│   └── src/components/       # StoryIntakeForm, RunTracker, DeliveryResults
├── src/
│   ├── jobs/                 # PySpark gold pipelines
│   └── prompts/              # Mirrored LLM prompts (6 .txt files)
├── dags/                     # Airflow / EMR DAGs
├── config/jobs/              # Job YAML metadata
├── tests/                    # Structural + generated pytest
├── scripts/                  # register_gold_glue.py, fetch_emr_logs.py
└── docs/agent/               # User stories, .env.example, runbooks
```

**Backend (sibling repo):** [autonomous-etl-agent](https://github.com/MamtaVenugopal/autonomous-etl-agent) — FastAPI, worker, `docker-compose.yml`, agents, services.

---

## License / context

Autonomous ETL capstone: **user story → spec → code → execute on AWS → delivery report (chart + PDF)**, with optional gates and a landing intake UI.
