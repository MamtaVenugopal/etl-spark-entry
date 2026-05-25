"""Auto-generated structural tests for US-1779342207566."""
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/pipelines/gold/monthly_revenue_summary_by_product_category.py"

def test_pipeline_exists():
    assert PIPELINE.exists()

def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")

def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for t in ['olist_products_raw', 'olist_category_translation_raw']:
        assert t in text

def test_target_referenced():
    assert "monthly_revenue_summary_by_product_category" in PIPELINE.read_text(encoding="utf-8")
