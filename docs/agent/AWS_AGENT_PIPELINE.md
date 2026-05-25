# AWS agent pipeline (MWAA + EMR + S3 + Athena)

| Agent | Step name | Role |
|-------|-----------|------|
| 1 | `task_breakdown` | ETLSpec (aws / parquet / Glue) |
| 2 | `coding` | Airflow DAG + Spark job (`dags/`, `src/jobs/`) |
| — | `pr` | Structural tests + GitHub PR (Gate 2 merge) |
| 3 | `execute` | EMR run + Athena validation |
| 4 | `profile` | Data profiling on gold table |
| 5 | `deploy` | Report + audit + PDF |

See **[AGENT_PIPELINE_OVERVIEW.md](./AGENT_PIPELINE_OVERVIEW.md)** for inputs, prompts, and outputs.

## Path A — local CLI

```bash
cd autonomous-etl-agent && source venv/bin/activate

# 1–2 local
python scripts/run_task_breakdown.py config/stories/US001_monthly_revenue.yaml
python scripts/run_coding.py config/stories/US001_monthly_revenue.yaml

# PR — open GitHub PR (needs GITHUB_TOKEN + GITHUB_REPO)
python scripts/run_pr.py config/stories/US001_monthly_revenue.yaml

# 3 — full EMR (needs IAM roles + bronze data in S3)
python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml

# 3 — validate only (gold table must already exist in Glue/Athena)
python scripts/run_execute.py config/stories/US001_monthly_revenue.yaml --skip-emr

# 4 — profiling
python scripts/run_profile.py config/stories/US001_monthly_revenue.yaml

# 5 — report
python scripts/run_deploy.py config/stories/US001_monthly_revenue.yaml
```

## Generated artifacts (US-001)

- `dags/us_001_monthly_revenue_dag.py` — MWAA: create EMR → spark-submit → terminate
- `src/jobs/monthly_revenue_summary.py` — reads `s3://olist-ecommerce-raw-2026/bronze/raw/*`, writes gold Parquet
- `config/jobs/us_001.yaml`

## `.env` required for Agent 3

```env
EMR_SERVICE_ROLE=EMR_DefaultRole
EMR_EC2_INSTANCE_PROFILE=EMR_EC2_DefaultRole
AWS_REGION=us-west-1
S3_DATA_BUCKET=olist-ecommerce-raw-2026
```

Optional: `EXECUTE_SKIP_EMR=true` to skip cluster and only run Athena checks.

## Full stack

```bash
docker compose up -d redis api worker
```
