#!/usr/bin/env python3
"""
Fetch EMR failure logs (step stderr + Spark driver stdout with Python traceback).

Examples:
  python scripts/fetch_emr_logs.py --cluster j-266X0KBN0YB82
  python scripts/fetch_emr_logs.py --cluster j-266X0KBN0YB82 --step s-05222123GROKFKI57Y1O
  python scripts/fetch_emr_logs.py --run-id 249b6ab0-20bd-447d-bde0-92d2924b6efd
"""

from __future__ import annotations

import argparse
import gzip
import io
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _s3():
    import boto3

    region = _env("AWS_REGION", "us-west-1")
    return boto3.client("s3", region_name=region)


def _emr():
    import boto3

    region = _env("AWS_REGION", "us-west-1")
    return boto3.client("emr", region_name=region)


def _read_gz_s3(bucket: str, key: str) -> str:
    body = _s3().get_object(Bucket=bucket, Key=key)["Body"].read()
    return gzip.decompress(body).decode("utf-8", errors="replace")


def _latest_step(cluster_id: str) -> str:
    steps = _emr().list_steps(ClusterId=cluster_id)["Steps"]
    if not steps:
        raise SystemExit(f"No steps on cluster {cluster_id}")
    return steps[-1]["Id"]


def _find_cluster_by_run(run_id: str) -> str | None:
    emr = _emr()
    resp = emr.list_clusters(
        ClusterStates=["RUNNING", "WAITING", "TERMINATED", "TERMINATED_WITH_ERRORS"],
    )
    needle = run_id.replace("-", "")[:12]
    for c in resp.get("Clusters", []):
        name = c.get("Name", "")
        if run_id in name or run_id[:8] in name:
            return c["Id"]
    for c in resp.get("Clusters", []):
        if needle in c.get("Name", "").replace("-", ""):
            return c["Id"]
    return None


def _spark_traceback_from_cluster(bucket: str, cluster_id: str) -> str:
    prefix = f"emr-logs/{cluster_id}/containers/"
    keys = []
    token = None
    while True:
        kw = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 500}
        if token:
            kw["ContinuationToken"] = token
        resp = _s3().list_objects_v2(**kw)
        for obj in resp.get("Contents", []):
            k = obj["Key"]
            if k.endswith("/stdout.gz") and "application_" in k:
                keys.append(k)
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
    for key in sorted(keys, key=lambda k: k.count("/")):
        text = _read_gz_s3(bucket, key)
        if "Traceback (most recent call last)" in text:
            idx = text.find("Traceback")
            return text[idx : idx + 8000]
        if "AnalysisException" in text:
            idx = text.find("AnalysisException")
            return text[max(0, idx - 200) : idx + 4000]
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch EMR failure logs from S3")
    parser.add_argument("--cluster", help="EMR cluster id (j-XXXXXXXX)")
    parser.add_argument("--step", help="EMR step id (optional; default latest)")
    parser.add_argument("--run-id", help="Pipeline run UUID (find cluster by name)")
    parser.add_argument("--script", action="store_true", help="Print S3 script path for run-id")
    args = parser.parse_args()

    bucket = _env("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
    cluster_id = args.cluster
    if args.run_id and not cluster_id:
        cluster_id = _find_cluster_by_run(args.run_id)
        if not cluster_id:
            print(f"No EMR cluster found matching run_id={args.run_id}", file=sys.stderr)
            print("Use: aws emr list-clusters --region us-west-1 ...", file=sys.stderr)
            return 1

    if not cluster_id:
        parser.error("Provide --cluster or --run-id")

    if args.script and args.run_id:
        prefix = _env("S3_SCRIPTS_PREFIX", "scripts").strip("/")
        print(f"s3://{bucket}/{prefix}/{args.run_id}/")
        for key in _s3().list_objects_v2(
            Bucket=bucket, Prefix=f"{prefix}/{args.run_id}/"
        ).get("Contents", []):
            print(f"  {key['Key']}")

    step_id = args.step or _latest_step(cluster_id)
    print(f"Cluster: {cluster_id}")
    print(f"Step:    {step_id}")
    print(f"Console: https://us-west-1.console.aws.amazon.com/emr/home?region=us-west-1#/clusterDetails/{cluster_id}")
    print()

    for label, suffix in (("STEP STDERR", f"emr-logs/{cluster_id}/steps/{step_id}/stderr.gz"),):
        try:
            text = _read_gz_s3(bucket, suffix)
            print(f"=== {label} ===")
            print(text[-4000:] if len(text) > 4000 else text)
            print()
        except Exception as exc:
            print(f"=== {label} (missing: {exc}) ===\n")

    tb = _spark_traceback_from_cluster(bucket, cluster_id)
    if tb:
        print("=== SPARK PYTHON TRACEBACK (driver stdout) ===")
        print(tb)
    else:
        print("No Python traceback in container stdout.gz files.", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
