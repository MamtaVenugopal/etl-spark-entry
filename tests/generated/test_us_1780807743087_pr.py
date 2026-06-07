"""Auto-generated PR acceptance tests — do not edit by hand."""
from __future__ import annotations

import pytest
from pathlib import Path

STORY_ID = "US-1780807743087"
TARGET = "gold.quarterly_revenue_summary"
ACCEPTANCE_CRITERIA = [
  "SELECT COUNT(*) FROM gold.quarterly_revenue_summary WHERE revenue IS NOT NULL",
  "SELECT SUM(revenue) FROM gold.quarterly_revenue_summary WHERE quarter = '2023-Q1'",
  "SELECT DISTINCT quarter FROM gold.quarterly_revenue_summary"
]

PIPELINE = Path(__file__).resolve().parents[2] / "src/jobs/quarterly_revenue_summary.py"


def _job_text() -> str:
    assert PIPELINE.exists(), f'Missing job {PIPELINE}'
    return PIPELINE.read_text(encoding='utf-8')


def test_acceptance_criteria_documented():
    """Each acceptance criterion is listed for PR reviewers."""
    assert len(ACCEPTANCE_CRITERIA) >= 1
    for i, criterion in enumerate(ACCEPTANCE_CRITERIA, start=1):
        assert criterion.strip(), f'Criterion {i} is empty'


def test_source_tables_referenced_in_job():
    sources = ["olist_orders_raw", "olist_order_items_raw"]
    text = _job_text()
    for table in sources:
        assert table in text, f'Job must reference {table}'


@pytest.mark.skip(reason='Runtime SQL validation runs at deploy, not in PR pytest')
def test_athena_acceptance_sql():
    pass

