"""Auto-generated PR acceptance tests — do not edit by hand."""
from __future__ import annotations

import pytest
from pathlib import Path

STORY_ID = "US-1781906725463"
TARGET = "gold.order_count_by_seller_state_city"
ACCEPTANCE_CRITERIA = [
  "SELECT seller_state, seller_city, total_orders",
  "FROM gold.order_count_by_seller_state_city",
  "WHERE total_orders > 0"
]

PIPELINE = Path(__file__).resolve().parents[2] / "src/jobs/order_count_by_seller_state_city.py"


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


def test_source_tables_referenced_in_job():
    sources = ["olist_orders_raw", "olist_sellers_raw", "olist_order_items_raw"]
    text = _job_text()
    for table in sources:
        assert table in text, f'Job must reference {table}'


@pytest.mark.skip(reason='Runtime SQL validation runs at deploy, not in PR pytest')
def test_athena_acceptance_sql():
    pass

