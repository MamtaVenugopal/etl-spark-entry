# ETL Spark Entry (Lovable UI + pipelines)

**Lovable frontend** and **generated ETL artifacts** (PySpark jobs, Airflow DAGs, tests) for the Olist capstone. Agent **prompts** and **setup docs** are mirrored in this repo so GitHub links resolve; run the FastAPI worker from your local `autonomous-etl-agent` folder (see [LOVABLE_E2E](docs/agent/LOVABLE_E2E.md)).

| Path in this repo | Contents |
|-------------------|----------|
| [`src/prompts/`](src/prompts/) | LLM prompts (`coding.txt`, `task_breakdown.txt`, …) |
| [`docs/agent/`](docs/agent/) | User stories, execute strategy, EMR setup, `.env.example` |
| [`src/jobs/`](src/jobs/), [`dags/`](dags/) | PySpark + Airflow (PR targets) |

**Capstone story:** [US-001 Monthly Revenue Summary](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/US001_monthly_revenue.yaml) — see also [README_USERSTORIES.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/README_USERSTORIES.md) for all 20 user stories.

---

## Table of contents

1. [How the program works](#how-the-program-works)
2. [Architecture](#architecture)
3. [Framework and libraries](#framework-and-libraries)
4. [Pipeline steps and agents](#pipeline-steps-and-agents)
5. [Prompts](#prompts)
6. [Evaluation system](#evaluation-system)
7. [Data platform (AWS)](#data-platform-aws)
8. [API and Lovable UI](#api-and-lovable-ui)
9. [Configuration (.env)](#configuration-env)
10. [Quick start](#quick-start)
11. [Related documentation](#related-documentation)

---

## How the program works

```text
User (Lovable UI)
    │  POST /stories  { story_id, title, content }
    ▼
FastAPI (src/api/main.py)
    │  creates run in Redis (RunStore)
    │  optional Jira tickets
    ▼
Redis queue  ──►  Worker (src/worker.py)
    │
    ├──► 1. task_breakdown   → ETLSpec + evaluation
    ├──► [Gate 1] human or AUTO_GATE_1
    ├──► 2. coding           → PySpark + Airflow DAG + YAML
    ├──► 3. pr               → pytest + GitHub PR
    ├──► [Gate 2] human or AUTO_GATE_2 (merge PR)
    ├──► 4. execute          → Spark (EMR/local) + Athena validation
    ├──► 5. profile          → YData HTML + metrics
    └──► 6. deploy           → sample rows + audit + PDF report
    ▼
GET /runs/{id}  →  status, evaluations, report, error, outputs
```

Each step produces an **`AgentEvaluation`** (`passed`, `score`, `checks[]`, `summary`). If a step fails, the run status becomes **`FAILED`** and `error` explains why.

Human gates (optional):

| Gate | When | API |
|------|------|-----|
| **Gate 1** | After task breakdown | `POST /runs/{id}/confirm` |
| **Gate 2** | After PR created | `POST /runs/{id}/approve` (merge PR) |

Set `AUTO_GATE_1=true` and `AUTO_GATE_2=true` in `.env` to skip manual gates when evaluations pass.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  Lovable UI  (etl-spark-entry)                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (ngrok → localhost:8000)
┌────────────────────────────▼────────────────────────────────────┐
│  api (FastAPI + uvicorn)     redis          worker (Python loop)   │
│  - submit story              queue          - runs pipeline        │
│  - poll run status           RunStore       - boto3 / GitHub       │
│  - gates, PDF, profile HTML                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   OpenAI API            GitHub API          AWS (S3, Glue, Athena,
   (LangChain)                               EMR, optional MWAA)
```

| Component | Path (local `autonomous-etl-agent/`) | Role |
|-----------|------|------|
| API | `src/api/main.py` | HTTP intake, run status, gates, PDF |
| Worker | `src/worker.py` | Dequeues runs, runs pipeline steps |
| Run store | `src/api/run_store.py` | Redis-backed run state |
| Agents | `src/agents/` | Step implementations — see [AGENT_PIPELINE_OVERVIEW](docs/agent/AGENT_PIPELINE_OVERVIEW.md) |
| Evaluators | `src/evaluators/` | Rule-based quality checks per step |
| RAG | `src/rag/` | FAISS over schema chunks |
| Services | `src/services/` | EMR, Glue, GitHub, Spark sanitize/repair, SQL |

**Docker Compose:** run `docker compose up` from local `autonomous-etl-agent/` — see [LOVABLE_E2E](docs/agent/LOVABLE_E2E.md).

---

## Framework and libraries

### Orchestration model

This project does **not** use LangGraph or AutoGen for multi-agent orchestration. The **worker** is a **deterministic Python loop** over fixed steps (`task_breakdown` → … → `deploy`).

### Where LangChain is used

| Use case | Library | Details |
|----------|---------|---------|
| **LLM calls** | `langchain-openai` `ChatOpenAI` | Agents 1 & 2 (and optional spec critique) |
| **Structured output** | `with_structured_output(ETLSpec)` | Task breakdown → Pydantic model |
| **Messages** | `langchain_core.messages` | `SystemMessage`, `HumanMessage` |
| **Embeddings + FAISS** | `langchain-openai` + `langchain-community` | Schema RAG index (`src/rag/schema_index.py`) |

### Other core dependencies

| Library | Purpose |
|---------|---------|
| **Pydantic v2** | `ETLSpec`, API schemas, evaluations |
| **FastAPI / uvicorn** | REST API |
| **Redis** | Run queue and state |
| **boto3** | S3, Glue, Athena, EMR |
| **PyGithub** | Pull requests |
| **pytest** | Structural tests in PR step |
| **ydata-profiling** | Profile HTML reports |
| **PySpark** (local/EMR) | ETL execution |

### Rule-based vs LLM per step

| Step | LLM? | Primary mechanism |
|------|------|-------------------|
| task_breakdown | Optional | YAML fast-path **or** OpenAI + RAG |
| coding | Optional | US-001 **templates** **or** OpenAI + sanitize/repair |
| pr | No | GitHub API + pytest |
| execute | No | EMR / local Spark + Athena SQL |
| profile | No | Athena → pandas → YData |
| deploy | No | SQL sample + S3 audit JSON |

---

## Pipeline steps and agents

### Summary table

| Step | Agent module | Input | Output (run fields) | Prompt file |
|------|--------------|-------|---------------------|-------------|
| **task_breakdown** | `task_breakdown_agent.py` (local agent) | `story_id`, `title`, `content` | `parsed_spec`, `evaluations.task_breakdown` | [`task_breakdown.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/task_breakdown.txt) |
| **coding** | `coding_agent.py` (local agent) | `ETLSpec` | `generated_files[]`, files on disk | [`coding.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/coding.txt) |
| **pr** | `pr_agent.py` + `test_agent.py` | `ETLSpec`, `generated_files` | `outputs.pr_url`, `test_files`, `evaluations.tests`, `evaluations.pr` | — |
| **execute** | `execute_agent.py` | `ETLSpec`, `generated_files` | `data_validation[]`, `outputs.emr_*`, `outputs.execute_log` | — |
| **profile** | `profile_agent.py` | `ETLSpec` | `outputs.profile_report` | — |
| **deploy** | `deploy_agent.py` | Full run + `ETLSpec` | `result_preview`, audit URI, PDF | — |

---

### Agent 1 — Task breakdown

**Purpose:** Turn YAML or free-text user story into a structured **`ETLSpec`**.

| | |
|--|--|
| **Input** | `story_id`, `title`, `content` (YAML body or Lovable text) |
| **Output** | `ETLSpec` JSON → stored as `parsed_spec` |
| **Sources** | `yaml` (valid story file) or `openai` (LLM) |
| **Prompt** | [`src/prompts/task_breakdown.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/task_breakdown.txt) |
| **Extra context** | AWS platform blurb from [`config/aws_platform.yaml`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/aws_platform.yaml); optional **FAISS RAG** schema chunks |
| **Evaluation** | `SpecEvaluator` + `SchemaRAGEvaluator`; optional LLM via [`spec_evaluation.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/spec_evaluation.txt) |
| **CLI** | `python scripts/run_task_breakdown.py docs/agent/US001_monthly_revenue.yaml` (from local `autonomous-etl-agent/`) |

**`ETLSpec` fields:** `story_id`, `title`, `intent`, `source_tables`, `target_table`, `transformations`, `acceptance_criteria`, `data_platform`, `storage_format`, `glue_database_bronze`, `glue_database_gold`, `orchestration`.

---

### Agent 2 — Coding

**Purpose:** Generate **PySpark job**, **Airflow DAG** (EMR operators), and **job config YAML**.

| | |
|--|--|
| **Input** | `ETLSpec` |
| **Output** | `List[GeneratedFile]` — typically [`src/jobs/{table}.py`](https://github.com/MamtaVenugopal/etl-spark-entry/tree/main/src/jobs), [`dags/{story}_dag.py`](https://github.com/MamtaVenugopal/etl-spark-entry/tree/main/dags), [`config/jobs/{table}.yaml`](https://github.com/MamtaVenugopal/etl-spark-entry/tree/main/config/jobs) (committed to **this repo**) |
| **Sources** | `aws_template` / `template` (US-001 only), or `openai` |
| **Prompt** | [`src/prompts/coding.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/coding.txt) |
| **Post-processing** | `spark_job_sanitize.py`, `spark_job_repair.py` (local agent services) |
| **Evaluation** | `CodeEvaluator` — syntax, paths, EMR operators in DAG, references to sources/target |
| **CLI** | `python scripts/run_coding.py` (local `autonomous-etl-agent/`) |

**Templates (US-001):** [`monthly_revenue_summary.py`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/jobs/monthly_revenue_summary.py), [`US001_monthly_revenue_dag.py`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/dags/templates/US001_monthly_revenue_dag.py).

---

### Step 3 — PR (GitHub + tests)

**Purpose:** Run structural **pytest**, commit files, open **Pull Request**.

| | |
|--|--|
| **Input** | `ETLSpec`, generated files; tests from `TestAgent` / `structural_test_generator.py` |
| **Output** | `outputs.pr_url`, `pr_number`, `pr_branch`, `evaluations.pr`, `evaluations.tests` |
| **Prompt** | None |
| **Evaluation** | `TestEvaluator` (pytest), `PrEvaluator` (URL, branch, files committed) |
| **Skip** | `GITHUB_SKIP_PR=true` |
| **CLI** | `python scripts/run_pr.py config/stories/US001_monthly_revenue.yaml` |

---

### Agent 3 — Execute

**Purpose:** Materialize **gold Parquet on S3** (optional) and run **Athena** acceptance SQL.

| | |
|--|--|
| **Input** | `ETLSpec`, `generated_files` (Spark job path) |
| **Output** | `data_validation[]`, `outputs.emr_job_flow_id`, `outputs.emr_script_s3_uri`, `outputs.execute_log`, `outputs.execution_mode` |
| **Prompt** | None |
| **Execution** | See [EXECUTE_STRATEGY.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/EXECUTE_STRATEGY.md) — `smart` / local Spark / EMR / validate-only |
| **EMR** | `src/services/emr_jobs.py` (local agent) — see [EMR_IAM_SETUP](docs/agent/EMR_IAM_SETUP.md) |
| **Evaluation** | `ExecuteEvaluator` |
| **CLI** | `python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml [--skip-emr]` |

**Manual materialize (recommended for demos):**

```bash
# From autonomous-etl-agent clone (local Spark), or use scripts in this repo after pip install pyspark/boto3
python scripts/run_spark_job.py --job src/jobs/order_count_by_quarter_product_category.py
python scripts/register_gold_glue.py --table order_count_by_quarter_product_category
```

Scripts in this repo: [`register_gold_glue.py`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/scripts/register_gold_glue.py), [`fetch_emr_logs.py`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/scripts/fetch_emr_logs.py).

---

### Agent 4 — Profile

**Purpose:** Profile gold table — SQL metrics + **YData Profiling** HTML.

| | |
|--|--|
| **Input** | `ETLSpec`, gold table via Athena |
| **Output** | `outputs.profile_report` (metrics + path to HTML under `reports/profiles/`) |
| **Prompt** | None |
| **Evaluation** | `ProfileEvaluator` |
| **CLI** | `python scripts/run_profile.py` |
| **API** | `GET /runs/{id}/profile.html` |

---

### Agent 5 — Deploy

**Purpose:** Business **sample** of gold data, re-run validations, **audit** record, feed **PDF** report.

| | |
|--|--|
| **Input** | Full run state + `ETLSpec` |
| **Output** | `result_preview`, `data_validation`, `outputs.audit_s3_uri`, PDF via API |
| **Prompt** | None |
| **Evaluation** | `DeployEvaluator` |
| **CLI** | `python scripts/run_deploy.py` |

---

## Prompts

All LLM prompts live under **`src/prompts/`** in this repo (mirrored from the agent backend):

| File | Used by | Purpose |
|------|---------|---------|
| [`task_breakdown.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/task_breakdown.txt) | TaskBreakdownAgent | System prompt: story → JSON `ETLSpec` for AWS lakehouse |
| [`coding.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/coding.txt) | CodingAgent | System prompt: generate PySpark + MWAA/EMR DAG |
| [`spec_evaluation.txt`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/src/prompts/spec_evaluation.txt) | EvaluationAgent | Optional LLM critique of spec (`EVAL_USE_LLM=true`) |

**Coding user message (built in code):** JSON dump of `ETLSpec` + framework hints from [`config/framework_config.yaml`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/aws_platform.yaml).

**Task breakdown user message (built in code):**

```text
story_id: {id}
title: {title}

User story:
{content}
```

Plus optional RAG block: *"Olist schema knowledge (Glue / S3 Parquet bronze — RAG): …"*

---

## Evaluation system

**`EvaluationAgent`** (`src/agents/evaluation_agent.py`) routes to per-step evaluators:

| Agent key | Evaluator(s) | Checks (examples) |
|-----------|--------------|-------------------|
| `task_breakdown` | `SpecEvaluator`, `SchemaRAGEvaluator` | gold target, allowed tables, policies, RAG coverage |
| `coding` | `CodeEvaluator` | Python syntax, DAG has EMR ops, target referenced |
| `tests` | `TestEvaluator` | pytest passed, references target table |
| `pr` | `PrEvaluator` | PR URL valid, branch `feature/*`, files committed |
| `execute` | `ExecuteEvaluator` | EMR id (if EMR mode), Athena validations, execute_log |
| `profile` | `ProfileEvaluator` | YData HTML produced |
| `deploy` | `DeployEvaluator` | preview + validations |

Model: **`AgentEvaluation`** — `agent`, `passed`, `score` (0–1), `checks[]`, `summary`.

---

## Data platform (AWS)

| Layer | Technology |
|-------|------------|
| **Bronze** | CSV/Parquet on `s3://{bucket}/bronze/raw/` — Glue DB `bronze` |
| **Gold** | Parquet on `s3://{bucket}/gold/{table}/` — Glue DB `gold` |
| **Orchestration** | MWAA (Airflow DAGs in `dags/`) — EMR create → Spark → terminate |
| **Execute** | EMR Spark **or** local `scripts/run_spark_job.py` |
| **Validate** | Amazon **Athena** (acceptance criteria SQL) |
| **Catalog** | AWS **Glue** (`scripts/register_gold_glue.py`) |

Config: [`config/aws_platform.yaml`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/aws_platform.yaml), env vars in [`.env.example`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/.env.example).

Legacy **Databricks** path still exists (`DATA_PLATFORM=databricks`) for older demos.

---

## API and Lovable UI

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/stories` | Submit story → `run_id` |
| `GET` | `/runs/{run_id}` | Poll status, spec, evaluations, outputs, `error`, `report` |
| `POST` | `/runs/{run_id}/confirm` | Gate 1 |
| `POST` | `/runs/{run_id}/approve` | Gate 2 — merge PR |
| `GET` | `/runs/{run_id}/report.pdf` | PDF run report |
| `GET` | `/runs/{run_id}/profile.html` | YData profile HTML |
| `POST` | `/schema/refresh` | Refresh FAISS from Glue |

**Lovable (this repo):** set `VITE_API_BASE_URL` to ngrok URL → `http://localhost:8000`. See [LOVABLE_E2E.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/LOVABLE_E2E.md).

**Run statuses:** `RUNNING`, `AWAITING_CONFIRMATION`, `AWAITING_PR_APPROVAL`, `COMPLETE`, `FAILED`.

---

## Configuration (.env)

Copy [`.env.example`](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/.env.example) to `.env` in your **autonomous-etl-agent** clone. Key groups:

| Group | Variables |
|-------|-----------|
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL`, `EVAL_USE_LLM` |
| **AWS** | `AWS_REGION`, `S3_DATA_BUCKET`, `GLUE_DATABASE_*`, `ATHENA_OUTPUT_S3` |
| **EMR** | `EMR_SERVICE_ROLE`, `EMR_EC2_INSTANCE_PROFILE`, `EMR_REUSE_CLUSTER_ID`, `EMR_TERMINATE_ON_SUCCESS` |
| **Execute** | `EXECUTE_SKIP_EMR`, `EXECUTE_EMR_IF_GOLD_MISSING`, `EXECUTE_STRATEGY`, `EXECUTE_AUTO_FALLBACK` |
| **GitHub** | `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BASE_BRANCH` |
| **Gates** | `AUTO_GATE_1`, `AUTO_GATE_2` |
| **RAG** | `SCHEMA_RAG_ENABLED`, `SCHEMA_RAG_TOP_K` |

### Same story with gold already built (typical)

```env
EXECUTE_SKIP_EMR=true
EXECUTE_EMR_IF_GOLD_MISSING=false
# EMR_REUSE_CLUSTER_ID=   # only if cluster is WAITING
```

### Build gold on EMR

```env
EXECUTE_SKIP_EMR=false
EXECUTE_EMR_IF_GOLD_MISSING=true
EMR_REUSE_FALLBACK_IF_TERMINATED=true
```

---

## Quick start

### 1. Install and configure

```bash
cd autonomous-etl-agent
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill OPENAI_API_KEY, AWS, GITHUB
```

### 2. Start stack

```bash
docker compose up -d redis api worker
# Optional: ngrok http 8000  →  Lovable VITE_API_BASE_URL
```

### 3. US-001 path (fastest demo)

```bash
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml
python scripts/run_spark_job.py --job src/jobs/monthly_revenue_summary.py
python scripts/register_gold_glue.py --table monthly_revenue_summary
python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml --skip-emr
```

### 4. Submit from Lovable

Paste YAML from [README_USERSTORIES.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/README_USERSTORIES.md) or submit JSON story; poll `GET /runs/{run_id}`.

---

## Related documentation

| Document | Topic |
|----------|--------|
| [README_USERSTORIES.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/README_USERSTORIES.md) | All 20 user stories + YAML |
| [AGENT_PIPELINE_OVERVIEW.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/AGENT_PIPELINE_OVERVIEW.md) | Pipeline diagram (shorter) |
| [LOVABLE_E2E.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/LOVABLE_E2E.md) | ngrok + Lovable wiring |
| [LOVABLE_REPORT_UI.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/LOVABLE_REPORT_UI.md) | UI binding for reports |
| [EXECUTE_STRATEGY.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/EXECUTE_STRATEGY.md) | EMR vs local vs validate-only |
| [EMR_IAM_SETUP.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/EMR_IAM_SETUP.md) | EMR + Glue IAM roles |
| [ERROR_LOGS.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/ERROR_LOGS.md) | Where to find failures (API, S3, EMR) |
| [AGENT1_SETUP.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/AGENT1_SETUP.md) | Task breakdown + FAISS |
| [README_AGENT1_FAISS.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/AGENT1_SETUP.md) | Schema RAG deep dive |
| [AWS_AGENT_PIPELINE.md](https://github.com/MamtaVenugopal/etl-spark-entry/blob/main/docs/agent/AWS_AGENT_PIPELINE.md) | AWS-specific pipeline notes |

---

## Project layout

**This repo (etl-spark-entry):**

```text
etl-spark-entry/
├── src/
│   ├── components/landing/   # Lovable UI (StoryIntake, RunStatus)
│   └── jobs/                 # PySpark gold pipelines (PR targets)
├── dags/                     # Airflow / EMR DAGs
├── config/jobs/              # Job YAML metadata
├── tests/                    # Structural pytest
└── scripts/                  # register_gold_glue.py, fetch_emr_logs.py
```

**Backend (local clone, not on public GitHub):** `ETL_UserStories/autonomous-etl-agent/` — FastAPI, worker, `docker-compose.yml`. Prompts and docs are copied into this repo under `src/prompts/` and `docs/agent/`.

---

## License / context

Built as an autonomous ETL capstone: **user story → spec → code → PR → Spark on AWS → SQL validation → profile → deploy report**, with human gates and Lovable as the product shell.
