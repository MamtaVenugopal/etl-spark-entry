"""Auto-generated structural tests for US-1781901206479."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/jobs/monthly_revenue_summary.py"


def test_pipeline_exists():
    assert PIPELINE.exists(), f"Missing pipeline {PIPELINE}"


def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")


def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for table in ['olist_orders_raw', 'olist_order_items_raw', 'olist_products_raw', 'olist_category_translation_raw']:
        assert table in text, f"Pipeline must reference {table}"


def test_target_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    assert (
        "monthly_revenue_summary" in text
        or "gold.monthly_revenue_summary" in text
        or "TARGET_TABLE" in text
    ), "Pipeline should reference target table name or TARGET_TABLE env"
