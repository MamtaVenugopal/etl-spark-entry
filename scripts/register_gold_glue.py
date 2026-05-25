#!/usr/bin/env python3
"""
Register a gold Parquet table in Glue (no crawler required).

Examples:
  python scripts/register_gold_glue.py --table order_count_by_quarter_product_category
  python scripts/register_gold_glue.py --table monthly_revenue_summary
  python scripts/register_gold_glue.py --table my_table --crawler   # needs GLUE_CRAWLER_ROLE
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

import os

from src.services.aws_credentials import require_aws_credentials

# Known schemas for capstone / common Lovable tables (crawler-free)
TABLE_SCHEMAS = {
    "monthly_revenue_summary": [
        {"Name": "order_year", "Type": "int"},
        {"Name": "order_month", "Type": "int"},
        {"Name": "product_category_name_english", "Type": "string"},
        {"Name": "total_revenue", "Type": "double"},
        {"Name": "total_orders", "Type": "bigint"},
        {"Name": "avg_order_value", "Type": "double"},
    ],
    "order_count_by_quarter_product_category": [
        {"Name": "order_year", "Type": "int"},
        {"Name": "order_quarter", "Type": "int"},
        {"Name": "product_category_name_english", "Type": "string"},
        {"Name": "order_count", "Type": "bigint"},
    ],
    "order_count_by_quarter": [
        {"Name": "order_year", "Type": "int"},
        {"Name": "order_quarter", "Type": "int"},
        {"Name": "product_category_name_english", "Type": "string"},
        {"Name": "order_count", "Type": "bigint"},
    ],
}


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _glue():
    import boto3

    region = _env("AWS_REGION", "us-west-1")
    return boto3.client("glue", region_name=region)


def ensure_database(client, name: str) -> None:
    try:
        client.get_database(Name=name)
        print(f"Glue database exists: {name}")
    except client.exceptions.EntityNotFoundException:
        client.create_database(DatabaseInput={"Name": name})
        print(f"Created Glue database: {name}")


def register_parquet_table(
    client,
    *,
    database: str,
    table: str,
    location: str,
    columns: Optional[List[dict]] = None,
) -> None:
    """Register external Parquet table. Uses explicit columns or a minimal fallback schema."""
    cols = columns or [
        {"Name": "col1", "Type": "string"},
    ]
    storage = {
        "Columns": cols,
        "Location": location,
        "InputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
        "OutputFormat": "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
        "SerdeInfo": {
            "SerializationLibrary": "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
        },
    }
    table_input = {
        "Name": table,
        "TableType": "EXTERNAL_TABLE",
        "StorageDescriptor": storage,
        "Parameters": {"classification": "parquet", "EXTERNAL": "TRUE"},
    }
    try:
        client.get_table(DatabaseName=database, Name=table)
        client.update_table(
            DatabaseName=database, TableInput=table_input
        )
        print(f"Updated Glue table: {database}.{table}")
    except client.exceptions.EntityNotFoundException:
        client.create_table(DatabaseName=database, TableInput=table_input)
        print(f"Created Glue table: {database}.{table}")


def run_crawler(client, *, name: str, database: str, s3_path: str) -> None:
    """Optional — requires GLUE_CRAWLER_ROLE (AWSGlueServiceRole), not EMR_DefaultRole."""
    role = _env("GLUE_CRAWLER_ROLE")
    if not role:
        raise RuntimeError(
            "Glue crawler needs GLUE_CRAWLER_ROLE=AWSGlueServiceRole (or another role "
            "Glue can assume). EMR_DefaultRole will fail with TrustPolicy error. "
            "Prefer: python scripts/register_gold_glue.py --table <name>  (no --crawler)"
        )
    try:
        client.get_crawler(Name=name)
    except client.exceptions.EntityNotFoundException:
        client.create_crawler(
            Name=name,
            Role=role,
            DatabaseName=database,
            Targets={"S3Targets": [{"Path": s3_path}]},
            SchemaChangePolicy={
                "UpdateBehavior": "UPDATE_IN_DATABASE",
                "DeleteBehavior": "LOG",
            },
        )
        print(f"Created crawler: {name} (role={role})")
    client.start_crawler(Name=name)
    print(f"Started crawler: {name}")
    deadline = time.time() + 300
    while time.time() < deadline:
        state = client.get_crawler(Name=name)["Crawler"]["State"]
        if state == "READY":
            last = client.get_crawler(Name=name)["Crawler"].get("LastCrawl", {})
            status = last.get("Status", "OK")
            if status in ("SUCCEEDED", "COMPLETED"):
                print("Crawler finished successfully.")
                return
            if status == "FAILED":
                raise RuntimeError(f"Crawler failed: {last}")
            print("Crawler ready.")
            return
        if state in ("STOPPING", "STOPPED"):
            raise RuntimeError(f"Crawler in state {state}")
        time.sleep(3)
    raise TimeoutError(f"Crawler {name} did not finish in time")


def main() -> int:
    parser = argparse.ArgumentParser(description="Register gold Parquet in Glue")
    parser.add_argument(
        "--table",
        default="monthly_revenue_summary",
        help="Gold table name (folder under s3://bucket/gold/)",
    )
    parser.add_argument(
        "--crawler",
        action="store_true",
        help="Crawl entire gold/ prefix (needs GLUE_CRAWLER_ROLE)",
    )
    args = parser.parse_args()

    require_aws_credentials("Register gold in Glue")
    bucket = _env("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
    gold_prefix = _env("S3_GOLD_PREFIX", "gold").strip("/")
    database = _env("GLUE_DATABASE_GOLD", "gold")
    table = args.table.strip()
    table_path = f"s3://{bucket}/{gold_prefix}/{table}/"
    gold_root = f"s3://{bucket}/{gold_prefix}/"

    client = _glue()
    ensure_database(client, database)
    columns = TABLE_SCHEMAS.get(table)
    if columns:
        register_parquet_table(
            client, database=database, table=table, location=table_path, columns=columns
        )
    elif args.crawler:
        run_crawler(client, name="olist-gold-crawler", database=database, s3_path=gold_root)
    else:
        print(
            f"No built-in schema for '{table}'. Re-run with --crawler and GLUE_CRAWLER_ROLE, "
            f"or add columns to TABLE_SCHEMAS in register_gold_glue.py"
        )
        register_parquet_table(
            client, database=database, table=table, location=table_path, columns=None
        )

    if args.crawler and table in TABLE_SCHEMAS:
        run_crawler(client, name="olist-gold-crawler", database=database, s3_path=gold_root)

    print(f"\nAthena: {database}.{table}")
    print(f"  s3: {table_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
