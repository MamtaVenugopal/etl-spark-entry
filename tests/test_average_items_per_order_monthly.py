"""Auto-generated structural tests for US-1780802580347."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/jobs/average_items_per_order_monthly.py"


def test_pipeline_exists():
    assert PIPELINE.exists(), f"Missing pipeline {PIPELINE}"


def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")


def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for table in ['olist_orders_raw', 'olist_order_items_raw']:
        assert table in text, f"Pipeline must reference {table}"


def test_target_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    assert (
        "average_items_per_order_monthly" in text
        or "gold.average_items_per_order_monthly" in text
        or "TARGET_TABLE" in text
    ), "Pipeline should reference target table name or TARGET_TABLE env"


def test_two_step_aggregation():
    text = PIPELINE.read_text(encoding="utf-8")
    assert "items_in_order" in text
    assert "order_year" in text
    assert "order_month" in text
    assert "average_items_per_order" in text
