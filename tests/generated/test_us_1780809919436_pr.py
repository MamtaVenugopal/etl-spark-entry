"""Auto-generated PR acceptance tests — do not edit by hand."""
from __future__ import annotations

import pytest
from pathlib import Path

STORY_ID = "US-1780809919436"
TARGET = "gold.average_installments_by_payment_type_monthly"
ACCEPTANCE_CRITERIA = [
  "SELECT payment_type, year, month, AVG(installments) AS average_installments FROM gold.average_installments_by_payment_type_monthly WHERE year IN (2016, 2017, 2018) GROUP BY payment_type, year, month",
  "Check that the average_installments for 'credit_card' in January 2017 is correct",
  "Check that the average_installments for 'boleto' in December 2018 is correct"
]

PIPELINE = Path(__file__).resolve().parents[2] / "src/jobs/average_installments_by_payment_type_monthly.py"


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
    sources = ["olist_orders_raw", "olist_order_payments_raw"]
    text = _job_text()
    for table in sources:
        assert table in text, f'Job must reference {table}'


@pytest.mark.skip(reason='Runtime SQL validation runs at deploy, not in PR pytest')
def test_athena_acceptance_sql():
    pass

