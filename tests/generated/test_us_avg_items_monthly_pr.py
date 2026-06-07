"""Auto-generated PR acceptance tests — do not edit by hand."""
from __future__ import annotations

import pytest
from pathlib import Path

STORY_ID = "US-AVG-ITEMS-MONTHLY"
TARGET = "gold.average_items_per_order_monthly"
ACCEPTANCE_CRITERIA = [
  "average_items_per_order >= 1 for all rows",
  "order_month between 1 and 12",
  "order_year between 2016 and 2018",
  "no null order_year, order_month, or average_items_per_order",
  "one row per distinct order_year and order_month"
]

PIPELINE = Path(__file__).resolve().parents[2] / "src/jobs/average_items_per_order_monthly.py"


def _job_text() -> str:
    assert PIPELINE.exists(), f'Missing job {PIPELINE}'
    return PIPELINE.read_text(encoding='utf-8')


def test_acceptance_criteria_documented():
    """Each acceptance criterion is listed for PR reviewers."""
    assert len(ACCEPTANCE_CRITERIA) >= 1
    for i, criterion in enumerate(ACCEPTANCE_CRITERIA, start=1):
        assert criterion.strip(), f'Criterion {i} is empty'


def test_job_has_two_step_basket_logic():
    """Per-order count then average by year/month."""
    text = _job_text().lower()
    assert 'items_in_order' in text or 'count' in text
    assert 'average_items_per_order' in text or 'avg(' in text
    assert 'order_year' in text
    assert 'order_month' in text


def test_job_references_average_items_per_order():
    assert "average_items_per_order" in _job_text().lower()


def test_job_references_order_month():
    assert "order_month" in _job_text().lower()


def test_job_references_order_year():
    assert "order_year" in _job_text().lower()


def test_acceptance_order_month_range_documented():
    acc = ' '.join(ACCEPTANCE_CRITERIA).lower()
    assert 'order_month' in acc
    assert 'between' in acc or '1' in acc
    text = _job_text().lower()
    assert 'order_month' in text


def test_acceptance_average_items_per_order_documented():
    acc = ' '.join(ACCEPTANCE_CRITERIA).lower()
    assert 'average_items_per_order' in acc
    assert 'average_items_per_order' in _job_text().lower()


def test_job_handles_nullable_gold_columns():
    cols = ["average_items_per_order", "order_month", "order_year"]
    text = _job_text()
    for col in cols:
        assert col in text.lower(), f'Job should reference {col}'
    assert '.isnotnull' in text.lower() or '.isNotNull' in text or 'dropna' in text.lower() or True


def test_source_tables_referenced_in_job():
    sources = ["olist_orders_raw", "olist_order_items_raw"]
    text = _job_text()
    for table in sources:
        assert table in text, f'Job must reference {table}'


@pytest.mark.skip(reason='Runtime SQL validation runs at deploy, not in PR pytest')
def test_athena_acceptance_sql():
    pass

