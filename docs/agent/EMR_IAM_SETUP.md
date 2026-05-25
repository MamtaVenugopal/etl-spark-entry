# EMR IAM roles (fix `Invalid InstanceProfile`)

## What went wrong

`RunJobFlow` needs **two different** IAM names:

| API field | `.env` variable | Typical AWS name | Type |
|-----------|-----------------|------------------|------|
| `ServiceRole` | `EMR_SERVICE_ROLE` | `EMR_DefaultRole` | IAM **role** (EMR service) |
| `JobFlowRole` | `EMR_EC2_INSTANCE_PROFILE` | `EMR_EC2_DefaultRole` | IAM **instance profile** (EC2 nodes) |

The worker previously sent `EMR_DefaultRole` for **both**, which produced:

`Invalid InstanceProfile: EMR_DefaultRole`

That is fixed in `src/services/emr_jobs.py`. You still need the roles to exist in your AWS account.

---

## Step 1 — Create roles (one-time, AWS Console)

1. Open **Amazon EMR** → **Clusters** → **Create cluster** (you can cancel later).
2. Under **Permissions**, if you see **Create default roles**, click it.  
   AWS creates:
   - Service role: `EMR_DefaultRole`
   - Instance profile: `EMR_EC2_DefaultRole`
3. Or: **IAM** → search `EMR_DefaultRole` and `EMR_EC2_DefaultRole` and confirm both exist.

---

## Step 2 — `.env` (must match your account)

```env
EMR_SERVICE_ROLE=EMR_DefaultRole
EMR_EC2_INSTANCE_PROFILE=EMR_EC2_DefaultRole
EMR_RELEASE_LABEL=emr-7.0.0
EMR_MASTER_INSTANCE_TYPE=m5.xlarge
EMR_CORE_INSTANCE_TYPE=m5.xlarge
EMR_CORE_INSTANCE_COUNT=1
EMR_LOG_URI=s3://olist-ecommerce-raw-2026/emr-logs/
# Reuse existing cluster (WAITING only — not TERMINATED_WITH_ERRORS):
# EMR_REUSE_CLUSTER_ID=j-MUZP5J408SLM
# EMR_TERMINATE_ON_SUCCESS=false   # keep cluster up after success when reusing
# EMR_SUBNET_ID=subnet-xxxxxxxx   # uncomment if cluster fails on networking

## Cluster reuse (same job flow id)

| Behavior | Setting |
|----------|---------|
| Reuse cluster | `EMR_REUSE_CLUSTER_ID=j-XXXXXXXX` (cluster must be **WAITING**) |
| Step fails | Cluster **stays up** (`ActionOnFailure=CONTINUE`); full log in run `error` / `execute_log` |
| Step succeeds | Terminate only if `EMR_TERMINATE_ON_SUCCESS=true` or cluster was newly created |
| Retry / repair | Same `job_flow_id` via `retry_spark_step_on_emr` (no second cluster) |

Fetch logs: `python scripts/fetch_emr_logs.py --cluster j-XXXXXXXX`
```

Restart worker after changes:

```bash
docker compose restart worker
```

---

## Step 3 — Avoid EMR cost (optional)

If you only want to validate existing gold (e.g. US-001 already on S3):

```env
EXECUTE_SKIP_EMR=true
EXECUTE_EMR_IF_GOLD_MISSING=false
```

New Lovable stories need gold built once (local Spark or EMR with valid roles).

---

## Verify roles from terminal

```bash
aws iam get-role --role-name EMR_DefaultRole
aws iam get-instance-profile --instance-profile-name EMR_EC2_DefaultRole
```

Both must succeed in the same region/account as `AWS_REGION` (e.g. `us-west-1`).

---

## Custom role names

If your org uses different names, set the **exact** console names:

```env
EMR_SERVICE_ROLE=MyEmrServiceRole
EMR_EC2_INSTANCE_PROFILE=MyEmrEc2InstanceProfile
```

`EMR_EC2_INSTANCE_PROFILE` must be an **instance profile** name, not a bare IAM role name.
