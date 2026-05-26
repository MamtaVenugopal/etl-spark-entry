"""Auto-generated structural tests for US-1779820201073."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/jobs/average_installments_by_payment_type.py"


def test_pipeline_exists():
    assert PIPELINE.exists(), f"Missing pipeline {PIPELINE}"


def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")


def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for table in ['olist_orders_raw', 'olist_order_items_raw', 'olist_customers_raw']:
        assert table in text, f"Pipeline must reference {table}"


def test_target_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    assert (
        "average_installments_by_payment_type" in text
        or "gold.average_installments_by_payment_type" in text
        or "TARGET_TABLE" in text
    ), "Pipeline should reference target table name or TARGET_TABLE env"
