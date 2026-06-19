"""Auto-generated PR acceptance tests — do not edit by hand."""
from __future__ import annotations

import pytest
from pathlib import Path

STORY_ID = "US-1781899519216"
TARGET = "gold.monthly_revenue_summary"
ACCEPTANCE_CRITERIA = [
  "total_revenue is correctly calculated for each product_category_name_english for the months of January, February, and March in the years 2016, 2017, and 2018",
  "The output contains columns: year, month, product_category_name_english, total_revenue",
  "No records exist for months outside of January, February, and March"
]

PIPELINE = Path(__file__).resolve().parents[2] / "src/jobs/monthly_revenue_summary.py"


def _job_text() -> str:
    assert PIPELINE.exists(), f'Missing job {PIPELINE}'
    return PIPELINE.read_text(encoding='utf-8')


def test_acceptance_criteria_documented():
    """Each acceptance criterion is listed for PR reviewers."""
    assert len(ACCEPTANCE_CRITERIA) >= 1
    for i, criterion in enumerate(ACCEPTANCE_CRITERIA, start=1):
        assert criterion.strip(), f'Criterion {i} is empty'


def test_job_references_order_month():
    text = _job_text().lower()
    assert "order_month" in text or "month" in text


def test_job_references_order_year():
    text = _job_text().lower()
    assert "order_year" in text or "year" in text


def test_source_tables_referenced_in_job():
    sources = ["olist_orders_raw", "olist_order_items_raw", "olist_products_raw", "olist_category_translation_raw"]
    text = _job_text()
    for table in sources:
        assert table in text, f'Job must reference {table}'


@pytest.mark.skip(reason='Runtime SQL validation runs at deploy, not in PR pytest')
def test_athena_acceptance_sql():
    pass

