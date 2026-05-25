# Execute step strategies (Agent 3)

## Problem

Lovable generates **custom** Spark jobs. EMR is slow (~20 min), costly, and LLM jobs often fail on joins/timestamps even when bronze CSV is fixed.

## New logic (`EXECUTE_STRATEGY=smart`, default)

| Situation | What happens |
|-----------|----------------|
| Gold table **already exists** on S3/Glue | **Validate only** (Athena checks, fast) |
| **US-001** / `monthly_revenue_summary`, gold missing | Local Spark first → EMR fallback if allowed |
| **Custom Lovable story**, gold missing | Local Spark first → EMR only if `EXECUTE_ALLOW_EMR=true` |
| Gold missing + `EXECUTE_SKIP_EMR=true` | **Auto ladder** (smart): local Spark → EMR on error (disable with `EXECUTE_AUTO_FALLBACK=false`) |

## Recommended `.env` for your capstone demo

**Fast Lovable demo (US-001 only):**

```env
EXECUTE_SKIP_EMR=true
EXECUTE_EMR_IF_GOLD_MISSING=false
EXECUTE_STRATEGY=smart
```

Submit **US-001** from `README_USERSTORIES.md` — gold already built → ~2 min execute.

**Custom story with materialize (no EMR bill):**

```bash
python scripts/run_spark_job.py --job src/jobs/order_count_by_quarter_product_category.py
python scripts/register_gold_glue.py   # or wait for auto crawler
```

Then Lovable submit with `EXECUTE_SKIP_EMR=true`.

**Custom story with EMR (slow):**

```env
EXECUTE_SKIP_EMR=false
EXECUTE_ALLOW_EMR=true
EXECUTE_EMR_IF_GOLD_MISSING=true
```

## Env reference

| Variable | Default | Meaning |
|----------|---------|---------|
| `EXECUTE_STRATEGY` | `smart` | `smart` \| `emr` \| `local_spark` \| `validate_only` |
| `EXECUTE_SKIP_EMR` | `false` | Skip Spark entirely when gold exists |
| `EXECUTE_EMR_IF_GOLD_MISSING` | `false` | Auto-start EMR for missing gold |
| `EXECUTE_LOCAL_SPARK_FIRST` | `true` | Try Mac/local PySpark before EMR |
| `EXECUTE_ALLOW_EMR` | `true` | Fallback to EMR if local Spark fails |
| `EXECUTE_AUTO_FALLBACK` | *(unset = on for `smart`)* | Missing gold: try local Spark then EMR instead of failing immediately |
| `BRONZE_FORMAT` | `csv` | Olist Kaggle layout on S3 |

## Auto ladder (error-driven)

When gold is missing, Agent 3 can **try the next option** without you changing `.env` mid-run:

1. **Validate only** — if gold already exists on S3/Glue (fast path).
2. **Local Spark** — worker/host PySpark (cheap; needs Java in container).
3. **EMR** — if local fails or Java missing, and `EXECUTE_ALLOW_EMR=true`.

Set `EXECUTE_AUTO_FALLBACK=false` to restore **fail-fast** (no EMR surprise bills).

## Coding agent hardening

Generated jobs are sanitized: CSV bronze reader, safe gold paths, Olist left joins, `to_timestamp` before quarter/year.

EMR failures now pull **stderr tail** from S3 instead of `{}`.
