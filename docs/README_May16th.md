# Autonomous ETL Agent — 2-Day Sprint Plan

**Date:** May 16, 2026  
**Status:** Integration complete · Agents in progress  
**Capstone:** Transformative GenAI for Data Engineers | Interview Kickstart

---

## Executive summary

The **intake layer is done**: Lovable UI → FastAPI → Redis → Worker → Jira, with human gates and ngrok for HTTPS. What remains is replacing the **stub worker** with **real agents** that produce an ETL spec, PySpark code, tests, and a **real GitHub PR**.

This document replaces the 4-week timeline with a **focused 2-day plan** (optional **day 0 = today, 1 hour** for Agent 1 only).

| Layer | State |
|-------|--------|
| Lovable UI + polling | Done |
| FastAPI hub (`/stories`, `/runs`, gates) | Done |
| Redis queue + worker skeleton | Done |
| Jira integration | Done |
| Task Breakdown Agent | **Day 1 AM** |
| Coding Agent (US-001) | **Day 1 PM** |
| Test Agent (minimal) | **Day 2 AM** |
| PR Agent (PyGitHub) | **Day 2 PM** |
| Deploy Agent | Stub / demo only |
| LangGraph | Optional wrapper; not required for demo |

---

## Architecture (simplified for speed)

We keep the README’s two-ticket / three-zone design but **skip LangGraph on day 1** and call agents directly from the worker.

```text
┌─────────────┐     POST /stories      ┌──────────────┐
│  Lovable UI │ ─────────────────────► │   FastAPI    │
└─────────────┘     GET /runs/{id}     └──────┬───────┘
       ▲              (poll 3s)               │
       │                                      ▼
       │                              ┌──────────────┐
       └──────── status / gates       │    Redis     │
                                      └──────┬───────┘
                                             │ dequeue
                                      ┌──────▼───────┐
                                      │    Worker    │
                                      │  (sequential)│
                                      └──────┬───────┘
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
             Task Breakdown            Coding + Test              PR Agent
             → ETLSpec                 → .py files              → GitHub PR
                    │                        │                        │
                    ▼                        ▼                        ▼
              GATE 1: confirm          GATE 2: approve         COMPLETE
```

**Design rules (no gaps):**

1. **Single write path:** Lovable only calls FastAPI (no direct Jira from UI).
2. **Single source of generated code:** `autonomous-etl-agent/src/pipelines/`.
3. **Canonical spec:** `ETLSpec` (Pydantic) after Agent 1; Coding Agent reads only that.
4. **Run state in Redis** must include: `parsed_spec`, `generated_files`, `test_results`, `outputs.pr_url`.
5. **Databricks:** use workspace host only (`https://dbc-....cloud.databricks.com`), not `/explore/...` URLs.

---

## What is already built

| Component | Location |
|-----------|----------|
| API | `autonomous-etl-agent/src/api/main.py` |
| Run store (Redis) | `autonomous-etl-agent/src/api/run_store.py` |
| Stub worker | `autonomous-etl-agent/src/worker.py` |
| Jira service | `autonomous-etl-agent/services/jira_service.py` |
| Lovable UI | [etl-spark-entry](https://github.com/MamtaVenugopal/etl-spark-entry) |
| Olist data | Databricks workspace (existing) |

**Known limitations (fix during sprint):**

- PR URL in worker is **hardcoded** (`pull/1`) until PR Agent ships.
- `ANTHROPIC_API_KEY` must be set in `.env` for LLM agents.
- Run only **one** worker process to avoid queue blocking.

---

## 2-day schedule

### Day 1 — Agents 1 & 2 (spec + code)

| Time | Task | Deliverable |
|------|------|-------------|
| **AM (2–3 h)** | Task Breakdown Agent | `src/models/etl_spec.py`, `src/agents/task_breakdown_agent.py`, `config/stories/US001_monthly_revenue.yaml` |
| | Wire worker step `task_breakdown` | `parsed_spec` on run; Gate 1 shows spec in API |
| | CLI test | `python scripts/run_task_breakdown.py config/stories/US001.yaml` |
| **PM (3–4 h)** | Coding Agent (US-001 only) | `src/agents/coding_agent.py`, `config/framework_config.yaml` |
| | Output | `src/pipelines/gold/monthly_revenue_summary.py` (+ optional notebook stub) |
| | Wire worker step `coding` | `generated_files` in Redis run state |
| **Eve** | End-to-end test | Lovable submit → confirm at Gate 1 → see spec + file list |

### Day 2 — Test, PR, polish

| Time | Task | Deliverable |
|------|------|-------------|
| **AM (2–3 h)** | Test Agent (minimal) | `tests/test_monthly_revenue.py` — schema + row count + key aggregates |
| | Wire worker `tests` | `test_results` on run (pass/fail) |
| **PM (3–4 h)** | PR Agent | `src/agents/pr_agent.py` using PyGitHub |
| | Real PR | Branch `feature/US-001-monthly-revenue` on [etl-spark-entry](https://github.com/MamtaVenugopal/etl-spark-entry) or `autonomous-etl-agent` repo |
| | Wire worker `pr` + Gate 2 | Real `outputs.pr_url` |
| **Eve** | Demo script | One US-001 story: Lovable → spec → code → tests → PR → COMPLETE |
| **Optional** | Deploy stub | Set `dashboard_url` from env; no Jobs API required for pass |

### Explicitly deferred (after capstone demo)

- US-002, US-003 full pipelines  
- LangGraph state machine (add thin wrapper if rubric requires)  
- Airflow DAG  
- Databricks SQL dashboard (6 panels)  
- Jira Service Desk second ticket  

---

## Folder structure (target end of day 2)

```text
ETL_UserStories/
├── README.md                    # Original capstone spec
├── README_May16th.md            # This sprint plan
├── architecture.svg
└── autonomous-etl-agent/
    ├── .env.example
    ├── requirements.txt
    ├── config/
    │   ├── framework_config.yaml
    │   └── stories/
    │       ├── US001_monthly_revenue.yaml
    │       ├── US002_seller_scorecard.yaml   # stub OK
    │       └── US003_customer_rfm.yaml       # stub OK
    ├── src/
    │   ├── api/                 # Done
    │   ├── agents/
    │   │   ├── task_breakdown_agent.py
    │   │   ├── coding_agent.py
    │   │   ├── test_agent.py
    │   │   └── pr_agent.py
    │   ├── models/
    │   │   └── etl_spec.py
    │   ├── pipelines/
    │   │   ├── silver/
    │   │   └── gold/
    │   │       └── monthly_revenue_summary.py
    │   ├── prompts/
    │   └── worker.py            # Calls agents (not sleep stub)
    ├── services/
    │   └── jira_service.py
    ├── tests/
    │   └── test_monthly_revenue.py
    └── scripts/
        ├── start_api.sh
        ├── start_worker.sh
        ├── verify_api.sh
        └── run_task_breakdown.py
```

---

## Agent contracts (minimal)

### Agent 1 — Task Breakdown

- **Input:** `story_id`, `title`, `content` (YAML or JSON string from Lovable)
- **Output:** `ETLSpec` (Pydantic)
- **LLM:** Anthropic Claude (`ANTHROPIC_API_KEY`)
- **Fast path:** If `content` is valid YAML matching schema, parse without LLM

### Agent 2 — Coding

- **Input:** `ETLSpec` + `framework_config.yaml`
- **Output:** `list[{path, content}]` — at least one `.py` under `src/pipelines/gold/`
- **Scope day 1:** US-001 monthly revenue only

### Agent 3 — Test

- **Input:** generated files + `acceptance_criteria` from spec
- **Output:** `{passed: bool, messages: []}` — run `pytest` subprocess or static checks

### Agent 4 — PR

- **Input:** generated files + `story_id` + `GITHUB_TOKEN` + `GITHUB_REPO`
- **Output:** `{pr_url, branch}` via PyGitHub
- **Branch:** `feature/{story_id}-{slug}`

### Agent 5 — Deploy (stub)

- Set `outputs.dashboard_url` and `databricks_run_id` from env; no SDK call required for 2-day demo.

---

## Environment variables

```bash
# LLM (required day 1)
ANTHROPIC_API_KEY=sk-ant-...

# Jira (done)
JIRA_BASE_URL=https://mamtavenugopal.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...
JIRA_PROJECT_KEY=AEA

# GitHub (required day 2)
GITHUB_TOKEN=ghp_...
GITHUB_REPO=MamtaVenugopal/etl-spark-entry

# Databricks (fix host — no /explore/ path)
DATABRICKS_HOST=https://dbc-afda5f09-7319.cloud.databricks.com
DATABRICKS_TOKEN=dapi...

# Redis + API
REDIS_URL=redis://localhost:6379/0
ALLOWED_ORIGINS=https://preview--etl-spark-entry.lovable.app,...

# Lovable (in Lovable project settings, not .env)
VITE_API_BASE_URL=https://your-ngrok-or-deployed-url
```

---

## Daily runbook

### Start stack (every session)

```bash
cd autonomous-etl-agent
source venv/bin/activate
pip install -r requirements.txt   # after adding anthropic, pygithub, pyyaml

# Terminal 1
./scripts/start_api.sh

# Terminal 2
./scripts/start_worker.sh

# Terminal 3 (for Lovable)
ngrok http 8000
```

### Smoke test

```bash
./scripts/verify_api.sh http://127.0.0.1:8000
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
```

### Gate flow

| Status | Action |
|--------|--------|
| `AWAITING_CONFIRMATION` | `POST /runs/{id}/confirm` or Lovable Confirm button |
| `AWAITING_PR_APPROVAL` | `POST /runs/{id}/approve` or Lovable Approve button |
| `COMPLETE` | Done — check `outputs.pr_url` |

---

## Rubric mapping (2-day scope)

| Rubric area | How we hit it in 2 days |
|-------------|-------------------------|
| Agent design | 4 real agents + worker orchestration; gates preserved |
| Prompt engineering | Prompts in `src/prompts/`; Pydantic validation on spec |
| Code quality | US-001 PySpark pipeline + framework config |
| End-to-end workflow | Lovable → API → agents → real PR |
| DevOps automation | PR Agent + existing Jira automation |
| Setup & docs | This file + original README + `/docs` on API |

---

## Success criteria (demo-ready)

- [ ] Submit US-001 from Lovable; Jira ticket created (AEA-XX)
- [ ] Gate 1: user sees **parsed ETL spec** (not just PENDING)
- [ ] Gate 2: user sees **test summary** + file list
- [ ] **Real PR** visible on GitHub pulls page
- [ ] Run ends with `status: COMPLETE` and valid `pr_url`
- [ ] Generated pipeline references Olist tables in Databricks / Unity Catalog naming

---

## Today’s first hour (optional kickoff)

1. Create `src/models/etl_spec.py`
2. Copy US-001 YAML from README §8 into `config/stories/US001_monthly_revenue.yaml`
3. Implement `src/agents/task_breakdown_agent.py` (Anthropic SDK)
4. Add `scripts/run_task_breakdown.py` and verify JSON output
5. Add `anthropic`, `pyyaml` to `requirements.txt`

---

## Repositories

| Repo | Role |
|------|------|
| [MamtaVenugopal/etl-spark-entry](https://github.com/MamtaVenugopal/etl-spark-entry) | Lovable frontend |
| `autonomous-etl-agent` (this backend) | FastAPI, agents, pipelines — push with backend code |

---

*Last updated: May 16, 2026 — sprint plan after Lovable + FastAPI + ngrok integration validated.*
