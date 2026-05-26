# Agent pipeline — complete picture (AWS path)

## End-to-end goal

Turn a **user story** (YAML or text) into:

1. A **structured ETL spec** (what to build)
2. **Generated code** (Airflow DAG + PySpark job)
3. A **GitHub PR** with that code (review / merge to `main`)
4. **Gold data** on S3 (Parquet) via EMR or local Spark
5. **SQL validation** (acceptance criteria on the gold table)
6. **Profiling** (row counts, revenue stats, sample rows)
7. **Deploy report** (business sample + audit row + PDF for PM)

Human gates (optional):

- **Gate 1** — confirm spec after Agent 1 (`POST /runs/{id}/confirm`)
- **Gate 2** — approve PR merge after Agent PR (`POST /runs/{id}/approve`)

With `AUTO_GATE_1=true` and `AUTO_GATE_2=true`, both gates auto-clear when evaluations pass.

---

## Worker step order

```
task_breakdown → coding → pr → execute → profile → deploy
     Agent 1        Agent 2   PR+tests  Agent 3   Agent 4   Agent 5
```

---

## Agent 1 — Task breakdown (`task_breakdown`)

| | |
|--|--|
| **Input** | `story_id`, `title`, `content` (YAML file body or free text from Lovable) |
| **Prompt** | [`../../src/prompts/task_breakdown.txt`](../../src/prompts/task_breakdown.txt) + AWS platform context + optional **FAISS schema RAG** |
| **LLM** | `ChatOpenAI` structured output → `ETLSpec` (if not valid YAML fast-path) |
| **Evaluation** | `SpecEvaluator` (rules: gold target, allowed tables, policies) + optional LLM review via [`../../src/prompts/spec_evaluation.txt`](../../src/prompts/spec_evaluation.txt) |
| **Output** | `parsed_spec` (JSON), `evaluations.task_breakdown` |
| **Gate** | `AWAITING_CONFIRMATION` unless `AUTO_GATE_1` |

**CLI:** `python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml`

---

## Agent 2 — Coding (`coding`)

| | |
|--|--|
| **Input** | `ETLSpec` from Agent 1 |
| **Prompt** | [`../../src/prompts/coding.txt`](../../src/prompts/coding.txt) (AWS: S3 Parquet, MWAA, EMR) |
| **LLM** | Optional; **default for US-001 is templates** (`src/jobs/templates/`, `dags/templates/`) when `DATA_PLATFORM=aws` |
| **Evaluation** | `CodeEvaluator` — files exist, valid Python, gold path, references sources |
| **Output** | `generated_files[]` on disk: `src/jobs/*.py`, `dags/*_dag.py`, `config/jobs/*.yaml` |

**CLI:** `python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml`

---

## PR step (`pr`) — GitHub + structural tests

| | |
|--|--|
| **Input** | `ETLSpec`, `generated_files`, pytest files from **TestAgent** |
| **Prompt** | None (GitHub API + rule-based **PrEvaluator**) |
| **Actions** | 1) Run structural `pytest` on generated tests 2) Commit files to `feature/{story_id}-...` 3) Open PR to `GITHUB_REPO` |
| **Evaluation** | `evaluations.tests`, `evaluations.pr` |
| **Output** | `outputs.pr_url`, `pr_number`, `pr_branch`, `test_files` |
| **Gate** | `AWAITING_PR_APPROVAL` → merge PR → `gate_2_approved` unless `AUTO_GATE_2` (auto-merge) |
| **Skip** | `GITHUB_SKIP_PR=true` (dev only; skips PR for AWS-only runs) |

**CLI:** `python scripts/run_pr.py config/stories/US001_monthly_revenue.yaml`

**Requires `.env`:** `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BASE_BRANCH`

---

## Agent 3 — Execute (`execute`)

| | |
|--|--|
| **Input** | `ETLSpec`, generated Spark job path |
| **Prompt** | None |
| **Actions** | If `EXECUTE_SKIP_EMR=false`: create EMR cluster → upload script → Spark → terminate. If `true`: skip cluster. Always run **Athena SQL** validations on gold table. |
| **Evaluation** | `ExecuteEvaluator` — EMR success (if run) + all validation checks pass |
| **Output** | `data_validation[]`, `outputs.emr_job_flow_id`, `outputs.emr_script_s3_uri` |

**CLI:** `python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml [--skip-emr]`

**Local alternative (no EMR):** `python scripts/run_spark_local_s3.py` then `register_gold_glue.py`

---

## Agent 4 — Profile (`profile`)

| | |
|--|--|
| **Input** | `ETLSpec`, gold table via Athena → pandas |
| **Library** | [YData Profiling](https://docs.profiling.ydata.ai/latest/) (`ProfileReport`) |
| **Actions** | SQL smoke metrics + full HTML report (distributions, correlations, missing data, graphs) |
| **Evaluation** | `ProfileEvaluator` (requires `ydata_html_path` when `PROFILE_USE_YDATA=true`) |
| **Output** | `outputs.profile_report` + `reports/profiles/ydata-profile-*.html` |

**CLI:** `python scripts/run_profile.py`

---

## Agent 5 — Deploy (`deploy`)

| | |
|--|--|
| **Input** | Full run state + `ETLSpec` |
| **Prompt** | None |
| **Actions** | Re-run acceptance SQL, sample gold table, build `report_json`, insert **audit row** (Databricks Delta today; AWS audit S3/Glue planned) |
| **Output** | `result_preview`, `data_validation`, `outputs.audit_table`, PDF via API |

**CLI:** `python scripts/run_deploy.py` (still Databricks-SQL oriented; AWS path uses execute + profile + `GET /report.pdf`)

---

## Two “reports” (PM view)

| Report | What | Where |
|--------|------|--------|
| **1 — Business sample** | Top rows from gold table | Agent 5 `result_preview`; PDF |
| **2 — YData profiling** | Full HTML with all graphs ([YData Profiling](https://docs.profiling.ydata.ai/latest/)) | Agent 4 HTML file; S3; `GET /runs/{id}/profile.html` |
| **3 — Audit JSON** | Run lineage | `s3://.../audit/etl_run_reports/{run_id}.json` |
| **PDF bundle** | Spec + checks + matplotlib + links to YData HTML | `GET /runs/{id}/report.pdf` |

---

## Lovable UI — what to show

Poll `GET /runs/{run_id}` every 2–3s. Stop and show UI on:

| `status` | UI |
|----------|-----|
| `AWAITING_CONFIRMATION` | Gate 1 — show `report.spec`, Confirm button (hide if `health.auto_gate_1`) |
| `AWAITING_PR_APPROVAL` | Gate 2 — show `outputs.pr_url`, Approve merges PR (hide if `auto_gate_2`) |
| `RUNNING` | Step list from `run.steps` — include **`pr`** between coding and execute |
| `COMPLETE` | Full `report`, Download PDF, PR merge status |
| `FAILED` | `error` |

**Bind:**

- `run.report.spec` — Agent 1
- `run.report.agents` — all evaluations (including `pr`, `tests`)
- `run.outputs.pr_url` — link before/after merge
- `run.outputs.pr_merged` / `pr_merge_message` — after Gate 2
- `run.report.profile_report` — Agent 4 metrics
- `run.data_validation` — Agent 3 checks
- `GET /runs/{id}/report.pdf` — combined PDF

See [LOVABLE_REPORT_UI.md](./LOVABLE_REPORT_UI.md).

---

## Path A (your Mac demo)

```bash
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml
python scripts/run_pr.py config/stories/US001_monthly_revenue.yaml   # optional
python scripts/run_spark_local_s3.py
python scripts/register_gold_glue.py
python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml --skip-emr
python scripts/run_profile.py
```

Full automation: `docker compose up` + worker with Redis.
