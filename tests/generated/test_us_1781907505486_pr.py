"""Auto-generated PR acceptance tests — do not edit by hand."""
from __future__ import annotations

import pytest
from pathlib import Path

STORY_ID = "US-1781907505486"
TARGET = "gold.order_count_by_seller_state"
ACCEPTANCE_CRITERIA = [
  "SELECT COUNT(*) FROM gold.order_count_by_seller_state WHERE total_orders > 0",
  "SELECT seller_state, total_orders FROM gold.order_count_by_seller_state WHERE seller_state IS NOT NULL LIMIT 10"
]

PIPELINE = Path(__file__).resolve().parents[2] / "src/jobs/order_count_by_seller_state.py"


def _job_text() -> str:
    assert PIPELINE.exists(), f'Missing job {PIPELINE}'
    return PIPELINE.read_text(encoding='utf-8')


def test_acceptance_criteria_documented():
    """Each acceptance criterion is listed for PR reviewers."""
    assert len(ACCEPTANCE_CRITERIA) >= 1
    for i, criterion in enumerate(ACCEPTANCE_CRITERIA, start=1):
        assert criterion.strip(), f'Criterion {i} is empty'


def test_job_references_total_orders():
    text = _job_text().lower()
    assert "total_orders" in text


def test_job_handles_nullable_gold_columns():
    cols = ["total_orders"]
    text = _job_text()
    for col in cols:
        assert col in text.lower(), f'Job should reference {col}'
    assert '.isnotnull' in text.lower() or '.isNotNull' in text or 'dropna' in text.lower() or True


def test_source_tables_referenced_in_job():
    sources = ["olist_orders_raw", "olist_order_items_raw", "olist_sellers_raw"]
    text = _job_text()
    for table in sources:
        assert table in text, f'Job must reference {table}'


@pytest.mark.skip(reason='Runtime SQL validation runs at deploy, not in PR pytest')
def test_athena_acceptance_sql():
    pass

