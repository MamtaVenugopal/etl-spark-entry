# Where to find errors when a run fails

## 1. Lovable UI / API (fastest)

Each run has an `error` field. Get it with:

```bash
RUN_ID="<paste run id from UI>"
curl -s "http://127.0.0.1:8000/runs/$RUN_ID" | python3 -m json.tool | grep -E '"error"|"status"|"current_step"'
```

Example errors:

| Message | Step | Meaning |
|---------|------|---------|
| `unmatched '}' (<spark_job>, line 56)` | **coding** | Generated Spark `.py` has invalid Python syntax |
| `pytest failed (exit 1)` | **pr** | Structural test failed — see worker logs or run pytest locally |
| `EMR step FAILED: ...` | **execute** | Spark on EMR failed — see **S3 EMR logs** below |
| `Athena query FAILED` | **execute** / **profile** | Gold table missing or SQL check failed |

---

## 2. Docker worker logs (coding, pr, execute)

```bash
cd /Users/satta/Desktop/ETL_UserStories/autonomous-etl-agent
docker logs autonomous-etl-agent-worker-1 --tail 100
```

Look for `Processing run <RUN_ID>` and Python tracebacks.

API logs:

```bash
docker logs autonomous-etl-agent-api-1 --tail 50
```

---

## 3. S3 — EMR only (execute step)

**Not used for coding/pr syntax errors.** Only when EMR ran.

| What | S3 path |
|------|---------|
| Log root | `s3://olist-ecommerce-raw-2026/emr-logs/` |
| Per cluster | `s3://olist-ecommerce-raw-2026/emr-logs/<CLUSTER_ID>/` |
| Spark step stderr | `.../steps/<STEP_ID>/stderr.gz` |
| Script that ran | `s3://olist-ecommerce-raw-2026/scripts/<RUN_ID>/<job>.py` |

```bash
# List recent EMR clusters with logs
aws s3 ls s3://olist-ecommerce-raw-2026/emr-logs/

# List steps
aws s3 ls s3://olist-ecommerce-raw-2026/emr-logs/j-39OSGND305F96/steps/

# Download Spark error log
aws s3 cp s3://olist-ecommerce-raw-2026/emr-logs/j-39OSGND305F96/steps/s-0619273RR0TX4T475HM/stderr.gz /tmp/e.gz
gunzip -c /tmp/e.gz | tail -60

# Python traceback (AnalysisException) — driver stdout
aws s3 cp s3://olist-ecommerce-raw-2026/emr-logs/j-CLUSTER/containers/application_*/container_*_01_000001/stdout.gz - | gunzip | tail -40

# Helper script (cluster id or run id)
python scripts/fetch_emr_logs.py --cluster j-266X0KBN0YB82
python scripts/fetch_emr_logs.py --run-id 249b6ab0-20bd-447d-bde0-92d2924b6efd --script
```

## 5. Auto-repair Spark on EMR failure (execute)

When EMR fails with a **runtime** Spark error (`AnalysisException`, bad column names), execute can **patch the job once** and **retry EMR** (new cluster):

```env
EXECUTE_EMR_RUNTIME_REPAIR=true   # default on
```

This uses **sanitizer rules** (not a full LLM rewrite). For a full regen, **submit the story again** from Lovable (coding step runs again).

**Coding agent** still only auto-fixes **Python syntax** before execute — not EMR runtime errors unless execute retry is enabled above.

Map cluster name → story:

```bash
aws emr list-clusters --region us-west-1 \
  --cluster-states TERMINATED TERMINATED_WITH_ERRORS \
  --query 'Clusters[*].[Id,Name]' --output table
```

---

## 4. Local reproduce (coding / pr)

```bash
cd /Users/satta/Desktop/ETL_UserStories/autonomous-etl-agent
source venv/bin/activate

# Syntax check a generated job
python3 -m py_compile src/jobs/order_count_by_quarter_product_category.py

# Run structural tests
python3 -m pytest tests/test_<gold_table_name>.py -v
```

---

## Coding agent auto-repair

When the LLM generates invalid Spark syntax, the coding agent:

1. **Sanitizes** (CSV bronze, joins, gold path)
2. **Repairs** up to `CODING_REPAIR_MAX_ATTEMPTS` passes (default 6)
3. **If still invalid** → **fails coding** with a clear error (no US-001 template substitution)

The run `error` / coding `summary` will describe the file path, line number, and that repair was exhausted.

---

## Why errors keep changing

| Step | Failure type |
|------|----------------|
| **coding** | LLM generates different Spark each submit; sanitizer fixes CSV/parens |
| **pr** | pytest on generated test file |
| **execute** | EMR Spark runtime OR Athena (gold missing) |

**Stable demo:** submit **US-001** YAML from `README_USERSTORIES.md` with `EXECUTE_SKIP_EMR=true` — avoids EMR and uses a fixed template job.

See also: `EXECUTE_STRATEGY.md`, `EMR_IAM_SETUP.md`
