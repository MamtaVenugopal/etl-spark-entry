# Agent pipeline — complete picture (AWS path)

## End-to-end goal

Turn a **user story** (YAML or text) into:

1. A **structured ETL spec** (what to build)
2. **Generated code** (Airflow DAG + PySpark job)
3. **Gold data** on S3 (Parquet) via EMR or local Spark
4. **SQL validation** (acceptance criteria on the gold table)
5. A **GitHub PR** with generated code (review / merge to `main`)
6. **Profiling** (YData HTML + smoke metrics)
7. **Deploy report** (business sample + story-aware charts + **Final delivery PDF**)

Human gates (optional):

- **Gate 1** — confirm spec after Agent 1 (`POST /runs/{id}/confirm`)
- **Gate 2** — approve PR merge during delivery (`POST /runs/{id}/approve`)

With `AUTO_GATE_1=true` and `AUTO_GATE_2=true`, both gates auto-clear when evaluations pass.

---

## Worker step order (current)

```text
task_breakdown → coding → execute → delivery
     Agent 1        Agent 2   Agent 3   Agent 4 (profile → tests → PR → deploy/PDF)
```

Legacy 6-step runs (`pr` / `profile` / `deploy` as separate worker steps) are still resumed for old queued runs.

---

## Intake (before worker)

### Story refine

| | |
|--|--|
| **API** | `POST /stories/refine` |
| **Module** | `services/story_refine.py` |
| **Prompt** | Inline system prompt (no `.txt` file) |
| **Output** | Structured story for landing UI |

### Story validation

| | |
|--|--|
| **API** | `POST /stories/validate` |
| **Module** | `story_validation_agent.py` |
| **Prompt** | [`src/prompts/story_validation.txt`](../../src/prompts/story_validation.txt) |
| **Evaluation** | `StorySpecEvaluator` + optional LLM review |

---

## Agent 1 — Task breakdown (`task_breakdown`)

| | |
|--|--|
| **Input** | `story_id`, `title`, `content` |
| **Prompt** | [`src/prompts/task_breakdown.txt`](../../src/prompts/task_breakdown.txt) + AWS platform + optional FAISS RAG |
| **Evaluation** | `SpecEvaluator` + optional [`spec_evaluation.txt`](../../src/prompts/spec_evaluation.txt) |
| **Output** | `parsed_spec`, `evaluations.task_breakdown` |
| **Gate** | `AWAITING_CONFIRMATION` unless `AUTO_GATE_1` |

---

## Agent 2 — Coding (`coding`)

| | |
|--|--|
| **Input** | `ETLSpec` from Agent 1 |
| **Prompt** | [`src/prompts/coding.txt`](../../src/prompts/coding.txt) |
| **Evaluation** | `CodeEvaluator` + `SparkJoinValidator` |
| **Output** | `generated_files[]` — `src/jobs/*.py`, `dags/*_dag.py`, `config/jobs/*.yaml` |

---

## Agent 3 — Execute (`execute`)

| | |
|--|--|
| **Input** | `ETLSpec`, generated Spark job |
| **Prompt** | — |
| **Actions** | EMR or local Spark; Athena SQL validations; Glue register |
| **Output** | `data_validation[]`, `outputs.emr_*`, `gold_s3_uri` |

---

## Agent 4 — Delivery (`delivery`)

Composite step after execute. Sub-phases:

| Phase | Module | Prompt | Output |
|-------|--------|--------|--------|
| **Profiling** | `profile_agent.py` | — | YData HTML, `profile_report` |
| **Testing** | `story_pr_test_agent.py` + `test_agent.py` | [`story_pr_test.txt`](../../src/prompts/story_pr_test.txt) | `evaluations.tests`, `test_files` |
| **PR** | `pr_agent.py` | — | `pr_url`, Gate 2 |
| **Report** | `deploy_agent.py` + `chart_selection_agent.py` | [`chart_selection.txt`](../../src/prompts/chart_selection.txt) | `result_preview`, `chart_profile`, audit, PDF |

**Retry:** `POST /runs/{id}/retry-delivery` if execute passed but delivery failed.

---

## PM deliverables

| Report | What | Where |
|--------|------|--------|
| **Business sample** | Top gold rows | `result_preview`; PDF |
| **Story-aware chart** | Bar / line / 3D surface | `outputs.chart_profile`; landing UI |
| **YData profiling** | Full HTML report | `GET /runs/{id}/profile.html` |
| **Final delivery PDF** | Spec + table + charts + validation + agent scores | `GET /runs/{id}/report.pdf` |
| **Audit JSON** | Run lineage | `s3://.../audit/etl_run_reports/{run_id}.json` |

---

## Lovable / landing UI

Poll `GET /runs/{run_id}` every 2–3s.

| `status` | UI |
|----------|-----|
| `AWAITING_CONFIRMATION` | Gate 1 — show spec, Confirm |
| `AWAITING_PR_APPROVAL` | Gate 2 — show `pr_url`, Approve |
| `RUNNING` | Step list: task_breakdown → coding → execute → delivery |
| `COMPLETE` | Table, chart, YData link, **Download PDF** |
| `FAILED` | `error` |

**Bind:** `run.report.chart_profile`, `run.outputs.delivery_phase`, `GET /runs/{id}/report.pdf`.

See [LOVABLE_REPORT_UI.md](./LOVABLE_REPORT_UI.md).

---

## Path A (Mac demo)

```bash
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml
python scripts/run_spark_local_s3.py
python scripts/register_gold_glue.py
python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml --skip-emr
# delivery runs automatically via worker, or use full docker compose + landing submit
```

Full automation: `docker compose up` + worker with Redis + landing **Ship to Agent**.
