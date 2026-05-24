"""Structural tests for US-001 pipeline (no Spark cluster required)."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
_JOB = ROOT / "src" / "jobs" / "monthly_revenue_summary.py"
_PIPELINE = ROOT / "src" / "pipelines" / "gold" / "monthly_revenue_summary.py"
PIPELINE = _JOB if _JOB.exists() else _PIPELINE

REQUIRED_TABLES = [
    "olist_orders_raw",
    "olist_order_items_raw",
    "olist_products_raw",
    "olist_category_translation_raw",
]


def test_pipeline_file_exists():
    assert PIPELINE.exists(), f"Missing pipeline {PIPELINE}"


def test_pipeline_is_valid_python():
    source = PIPELINE.read_text(encoding="utf-8")
    compile(source, str(PIPELINE), "exec")


def test_pipeline_references_bronze_sources():
    text = PIPELINE.read_text(encoding="utf-8")
    for table in REQUIRED_TABLES:
        assert table in text, f"Pipeline must reference {table}"


def test_pipeline_writes_gold_target():
    text = PIPELINE.read_text(encoding="utf-8")
    assert "monthly_revenue_summary" in text
    assert (
        "parquet" in text.lower()
        or "_gold_path" in text
        or "saveAsTable" in text
        or "delta" in text.lower()
    )


def test_pipeline_filters_delivered():
    text = PIPELINE.read_text(encoding="utf-8")
    assert "delivered" in text


def test_acceptance_total_revenue_column():
    text = PIPELINE.read_text(encoding="utf-8")
    assert "total_revenue" in text
