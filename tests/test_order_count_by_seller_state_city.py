"""Structural tests for order_count_by_seller_state_city Spark job."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/jobs/order_count_by_seller_state_city.py"


def test_pipeline_exists():
    assert PIPELINE.exists(), f"Missing pipeline {PIPELINE}"


def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")


def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for table in [
        "olist_orders_raw",
        "olist_order_items_raw",
        "olist_sellers_raw",
    ]:
        assert table in text, f"Pipeline must reference {table}"


def test_joins_via_order_items_not_direct_seller_on_orders():
    text = PIPELINE.read_text(encoding="utf-8")
    assert '.join(items.alias("i"), "order_id")' in text
    assert 'countDistinct("o.order_id")' in text
    assert "seller_state" in text and "seller_city" in text
