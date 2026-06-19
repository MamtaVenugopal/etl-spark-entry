# Agent pipeline overview

Turn a **user story** (YAML or refined text) into gold data on S3, a GitHub PR, and a **Final delivery PDF**.

**For hiring managers / reviewers:** [WHY_MULTI_AGENT.md](./WHY_MULTI_AGENT.md) — why four agents, evaluation criteria per step, chart vs preview data.

---

## Four agents (current worker)

New runs use **four worker steps**. PR, profiling, tests, and deploy/report are **sub-phases inside Agent 4 (delivery)** — not separate numbered agents.

```text
task_breakdown → coding → execute → delivery
     Agent 1        Agent 2   Agent 3   Agent 4
```

| Step | Module | Prompt | Output |
|------|--------|--------|--------|
| **task_breakdown** | `task_breakdown_agent.py` | [task_breakdown.txt](../../src/prompts/task_breakdown.txt) + optional FAISS RAG | `ETLSpec`, evaluations |
| **coding** | `coding_agent.py` | [coding.txt](../../src/prompts/coding.txt) | PySpark job, EMR DAG, job YAML |
| **execute** | `execute_agent.py` | — | Gold on S3, Athena validation |
| **delivery** | `delivery_agent.py` | — | Profile, pytest, PR, PDF, charts |

### Delivery sub-phases (Agent 4)

| Phase | What |
|-------|------|
| Profiling | YData HTML + SQL smoke metrics |
| Testing | Story-aware pytest + structural tests |
| PR | GitHub PR (+ optional Gate 2 merge) |
| Report | Gold sample, Chart Selection Agent, audit JSON, PDF |

**Charts:** [AGENT4_VISUALIZATION.md](./AGENT4_VISUALIZATION.md) · **Prompts:** [visualization_selection.txt](../../src/prompts/visualization_selection.txt) (primary), [chart_selection.txt](../../src/prompts/chart_selection.txt) (legacy)

---

## Intake (before worker)

| API | Purpose |
|-----|---------|
| `POST /stories/refine` | Free text → structured story |
| `POST /stories/validate` | Rule + LLM story checks — [story_validation.txt](../../src/prompts/story_validation.txt) |
| `POST /stories` | Submit story → `run_id` |

**Live UI:** [etl-spark-entry-qutk.vercel.app/intake](https://etl-spark-entry-qutk.vercel.app/intake)

---

## Agent 1 — Task breakdown

- **Input:** `story_id`, `title`, `content` (YAML or free text)
- **Evaluation:** `SpecEvaluator` + optional FAISS schema RAG
- **Output:** `parsed_spec`, `evaluations.task_breakdown`
- **Gate:** `AWAITING_CONFIRMATION` unless `AUTO_GATE_1=true`

---

## Agent 2 — Coding

- **Input:** `ETLSpec` from Agent 1
- **Evaluation:** `CodeEvaluator` + `SparkJoinValidator`
- **Output:** `src/jobs/*.py`, `dags/*_dag.py`, `config/jobs/*.yaml`

---

## Agent 3 — Execute

- **Input:** `ETLSpec`, generated Spark job
- **Actions:** EMR Spark (or local Spark) → gold on S3 → Glue → **Athena acceptance SQL**
- **Evaluation:** `ExecuteEvaluator` — materialization + all SQL checks pass
- **Output:** `data_validation[]`, `outputs.emr_job_flow_id`, `outputs.gold_s3_uri`

---

## Agent 4 — Delivery

- **Actions:** Profile → pytest → PR → (Gate 2 merge) → chart → audit JSON → PDF
- **Gate:** `AWAITING_PR_APPROVAL` during PR sub-phase unless `AUTO_GATE_2=true`

---

## Human gates (optional)

| Gate | API |
|------|-----|
| Confirm spec | `POST /runs/{id}/confirm` |
| Approve PR merge | `POST /runs/{id}/approve` |

Set `AUTO_GATE_1=true` and `AUTO_GATE_2=true` in the backend `.env` to auto-clear when evaluations pass.

---

## PM deliverables

| Artifact | Access |
|----------|--------|
| Gold table preview | Run page / `result_preview` |
| Acceptance-scoped chart | `report.chart_preview`, `outputs.chart_profile` |
| YData profile | `GET /runs/{id}/profile.html` |
| **Final delivery PDF** | `GET /runs/{id}/report.pdf` |
| SQL validation results | `data_validation` (Agent 3) |

Expected `steps` for new runs: `task_breakdown`, `coding`, `execute`, `delivery`.

---

## Backend source code

FastAPI worker, agents, and Docker live in the sibling repo [autonomous-etl-agent](https://github.com/MamtaVenugopal/autonomous-etl-agent).

> **Note:** If that link returns 404, the backend repo is **private**. Make it public under **Settings → General → Danger zone → Change visibility**, or run the backend locally from a clone.

**Quick start (local):**

```bash
git clone https://github.com/MamtaVenugopal/autonomous-etl-agent.git
cd autonomous-etl-agent/autonomous-etl-agent
cp .env.example .env
docker compose up -d redis api worker
```
