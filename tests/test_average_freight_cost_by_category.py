"""Auto-generated structural tests for US-TEST."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/jobs/average_freight_cost_by_category.py"


def test_pipeline_exists():
    assert PIPELINE.exists(), f"Missing pipeline {PIPELINE}"


def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")


def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for table in ['olist_order_items_raw', 'olist_products_raw']:
        assert table in text, f"Pipeline must reference {table}"


def test_target_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    assert "average_freight_cost_by_category" in text or "gold.average_freight_cost_by_category" in text
