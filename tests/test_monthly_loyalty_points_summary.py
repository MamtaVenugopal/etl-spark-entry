"""Auto-generated structural tests for US-1779559928016."""
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE = PROJECT_ROOT / "src/pipelines/gold/monthly_loyalty_points_summary.py"

def test_pipeline_exists():
    assert PIPELINE.exists()

def test_valid_python():
    compile(PIPELINE.read_text(encoding="utf-8"), str(PIPELINE), "exec")

def test_source_tables_referenced():
    text = PIPELINE.read_text(encoding="utf-8")
    for t in ['olist_loyalty_points_raw', 'olist_products_raw']:
        assert t in text

def test_target_referenced():
    assert "monthly_loyalty_points_summary" in PIPELINE.read_text(encoding="utf-8")
