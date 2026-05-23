"""Auto-generated structural tests for US-1779559791687."""
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/pipelines/gold/quarterly_loyalty_points_per_product.py"

def test_pipeline_exists():
    assert PIPELINE.exists()

def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")

def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for t in ['olist_loyalty_points_raw', 'olist_products_raw']:
        assert t in text

def test_target_referenced():
    assert "quarterly_loyalty_points_per_product" in PIPELINE.read_text(encoding="utf-8")
