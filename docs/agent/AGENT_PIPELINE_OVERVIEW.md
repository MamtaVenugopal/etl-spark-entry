# Agent pipeline overview

Turn a **user story** (YAML or refined text) into gold data on S3, a GitHub PR, and a **Final delivery PDF**.

## Worker steps

```text
task_breakdown → coding → execute → delivery
     Agent 1        Agent 2   Agent 3   Agent 4
```

| Step | Module | Prompt | Output |
|------|--------|--------|--------|
| **task_breakdown** | `task_breakdown_agent.py` | [task_breakdown.txt](../../src/prompts/task_breakdown.txt) | `ETLSpec`, evaluations |
| **coding** | `coding_agent.py` | [coding.txt](../../src/prompts/coding.txt) | PySpark job, EMR DAG, job YAML |
| **execute** | `execute_agent.py` | — | Gold on S3, Athena validation |
| **delivery** | `delivery_agent.py` | — | Profile, pytest, PR, PDF, charts |

### Delivery sub-phases (Agent 4)

| Phase | What |
|-------|------|
| Profiling | YData HTML + SQL smoke metrics |
| Testing | Story-aware pytest + structural tests |
| PR | GitHub PR (+ optional merge gate) |
| Report | Gold sample, Chart Selection Agent, audit JSON, PDF |

**Chart agent prompt:** [chart_selection.txt](../../src/prompts/chart_selection.txt)

## Intake (before worker)

| API | Purpose |
|-----|---------|
| `POST /stories/refine` | Free text → structured story |
| `POST /stories/validate` | Rule + LLM story checks — [story_validation.txt](../../src/prompts/story_validation.txt) |
| `POST /stories` | Submit story → `run_id` |

## PM deliverables

| Artifact | Access |
|----------|--------|
| Gold table preview | Run page / `result_preview` |
| Story-aware chart | `outputs.chart_profile` |
| YData profile | `GET /runs/{id}/profile.html` |
| **Final delivery PDF** | `GET /runs/{id}/report.pdf` |

## Human gates (optional)

| Gate | API |
|------|-----|
| Confirm spec | `POST /runs/{id}/confirm` |
| Approve PR merge | `POST /runs/{id}/approve` |

Set `AUTO_GATE_1=true` and `AUTO_GATE_2=true` in the backend `.env` to auto-clear when evaluations pass.

Backend repo: [autonomous-etl-agent](https://github.com/MamtaVenugopal/autonomous-etl-agent).
