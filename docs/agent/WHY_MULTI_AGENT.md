# Why multiple agents? — Design rationale for reviewers

This capstone implements an **agentic ETL pipeline**, not a single “do everything” LLM call. Each step has one job, one evaluation, and clear pass/fail criteria—similar to how a real platform team separates **product spec**, **engineering**, **QA**, and **release**.

---

## The core idea

| Principle | What it means here |
|-----------|-------------------|
| **Separation of concerns** | Planning, coding, execution, and delivery are different skills and different failure modes. |
| **Evaluate before proceed** | Every agent step runs a **rule-based evaluator** (and optional LLM review) before the worker continues. |
| **Human gates where it matters** | Optional Gate 1 (confirm spec) and Gate 2 (approve PR merge)—or auto-clear for demos. |
| **Deterministic checks on money paths** | SQL acceptance, pytest structure, Athena row counts—not “the model said it looks fine.” |

---

## Pipeline at a glance

```text
Intake (refine / validate)     ← optional LLM, before run starts
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ 1. Task breakdown   → ETLSpec          [Agent 1 + RAG schema] │
│ 2. Coding           → Spark + DAG        [Agent 2]            │
│ 3. Execute          → EMR + Athena     [Agent 3]            │
│ 4. Delivery         → profile→test→PR→PDF [Agent 4 + Chart] │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
Run page: table preview, acceptance-scoped chart, YData profile, PDF
```

---

## Why not one agent?

A single prompt that “reads the story and builds everything” would:

- Mix **schema design errors** with **Spark syntax errors** with **deployment failures**—hard to debug on a run page.
- Skip ** reproducible QA** (pytest, SQL acceptance) that hiring managers and production teams expect.
- Produce **charts from arbitrary preview rows** instead of acceptance-scoped aggregates.

Multiple agents mirror a real delivery workflow: **BA/spec → engineer → ops/execute → QA/release**.

---

## Agent-by-agent: role and pass criteria

### Intake — Story refine & validate (pre-pipeline)

| | |
|--|--|
| **Role** | Turn free text into structured YAML; catch bad table names and acceptance SQL before a run is queued. |
| **Prompt** | Inline refine prompt in `story_refine.py`; optional [`story_validation.txt`](../../src/prompts/story_validation.txt) |
| **Pass criteria** | Source tables exist in Olist registry; target is `gold.*`; acceptance SQL does not reference bronze row IDs on aggregate gold; years in 2016–2018 band. |

---

### Agent 1 — Task breakdown

| | |
|--|--|
| **Role** | Produce **`ETLSpec`**: sources, target, transformations, acceptance criteria. |
| **Prompt** | [`task_breakdown.txt`](../../src/prompts/task_breakdown.txt) + FAISS schema RAG + AWS platform context |
| **Pass criteria (rules)** | Target starts with `gold.`; allowed `olist_*` sources; min transformations/criteria; no forbidden SQL keywords; AWS platform fields set. |
| **Pass criteria (RAG)** | Every source table and join column exists in `schema_chunks.json`. |
| **Optional LLM** | [`spec_evaluation.txt`](../../src/prompts/spec_evaluation.txt) when `EVAL_USE_LLM=true`. |
| **Gate** | `AWAITING_CONFIRMATION` unless `AUTO_GATE_1=true`. |

**Why separate:** Bad specs are cheap to fix; bad Spark jobs and EMR runs are expensive.

---

### Agent 2 — Coding

| | |
|--|--|
| **Role** | Generate (or reuse canonical) **PySpark job**, **Airflow EMR DAG**, job YAML. |
| **Prompt** | [`coding.txt`](../../src/prompts/coding.txt) — or **template path** for known gold tables (e.g. `monthly_revenue_summary`). |
| **Pass criteria** | Python syntax valid; DAG has EMR create/run/terminate; every `source_tables` entry appears in job code; target table referenced; Spark join validator passes. |
| **On fail** | `NEEDS_INFO` with blocking questions; optional LLM retry with evaluator feedback. |

**Why separate:** Code generation has different constraints than spec writing (imports, EMR operators, join order).

---

### Agent 3 — Execute

| | |
|--|--|
| **Role** | Materialize gold on S3 (EMR or validate-only if gold exists); run **Athena acceptance SQL**. |
| **Prompt** | None — deterministic ops. |
| **Pass criteria** | EMR step success (if run); each acceptance check passes (row counts, revenue > 0, null rules, etc.). |

**Why separate:** Execution needs AWS credentials, retries, and SQL—not LLM creativity.

---

### Agent 4 — Delivery (profile → test → PR → report)

| | |
|--|--|
| **Role** | YData profile, structural pytest, GitHub PR, audit row, **Final delivery PDF**. |
| **Prompt** | None for core path; optional [`story_pr_test.txt`](../../src/prompts/story_pr_test.txt) for extra tests. |
| **Pass criteria** | Profile completes; pytest exit 0; PR created (or skipped in dev); deploy validation on gold sample. |
| **Gate** | PR merge approval unless `AUTO_GATE_2=true`. |

**Why separate:** Release artifacts (PR, PDF, profile HTML) are a different deliverable than “run Spark once.”

---

### Chart selection (inside delivery / deploy)

Charts are **two layers**—important for demos:

| Layer | Mechanism | Criteria |
|-------|-----------|----------|
| **Chart type & axes** | **Chart Selection Agent** — [`chart_selection.txt`](../../src/prompts/chart_selection.txt) + rules fallback | LLM chooses line/bar/3D using story, **acceptance_criteria**, gold columns; validated against real column names. |
| **Chart data points** | **`build_chart_preview()`** — no LLM | SQL `SUM(metric) GROUP BY year, month` filtered by acceptance `year IN … AND month IN …`; UI uses `chart_preview`, not raw top-N preview rows. |

**Why separate from “one chart prompt”:** Sample preview rows are often top categories (e.g. Nov 2017)—misleading for Q1 time-series stories. Acceptance-scoped SQL is the source of truth for the line chart.

---

## Evaluation pattern (same for every step)

```text
Agent runs  →  Evaluator (rules ± LLM)  →  passed? continue : FAILED / NEEDS_INFO
                      ↓
              Human gate (optional)
```

Run JSON exposes this under `evaluations.{task_breakdown,coding,execute,tests,pr,deploy,profile}` with per-check messages—what you see on the run tracker.

---

## What a hiring manager can verify in 5 minutes

1. **Intake** — [live demo](https://etl-spark-entry-qutk.vercel.app/intake): refine a Q1 revenue story; see structured YAML.
2. **Run page** — Completed run: four pipeline steps green; expand **evaluations** on the API or UI.
3. **Acceptance vs chart** — Acceptance says Q1 2016–2018; chart uses **`chart_preview`** (aggregated months), not Nov 2017 category rows from `result_preview`.
4. **Artifacts** — Download **Final delivery PDF**, open YData profile HTML, follow PR link if enabled.
5. **Prompts** — All LLM prompts live under [`src/prompts/`](../../src/prompts/) in this repo (mirrored from backend).

---

## Configuration flags (demo vs production)

| Flag | Effect |
|------|--------|
| `AUTO_GATE_1` / `AUTO_GATE_2` | Skip human confirm/approve when evaluators pass |
| `GITHUB_SKIP_PR` | Skip PR step locally |
| `EXECUTE_SKIP_EMR` | Validate existing gold only (faster demos) |
| `CHART_SELECTION_USE_LLM` | LLM chart axes vs rules-only fallback |
| `EVAL_USE_LLM` | Optional LLM critique of ETLSpec |

---

## Repos

| Repo | Role |
|------|------|
| **etl-spark-entry** (this repo) | Portfolio UI, generated jobs/DAGs, prompts mirror, docs |
| **autonomous-etl-agent** | FastAPI, worker, evaluators, chart SQL, PDF generation |

Backend: [github.com/MamtaVenugopal/autonomous-etl-agent](https://github.com/MamtaVenugopal/autonomous-etl-agent)
