"""Auto-generated story spec tests — do not edit by hand."""
from __future__ import annotations

import json

import pytest

from src.models.etl_spec import ETLSpec
from src.evaluators.story_spec_evaluator import StorySpecEvaluator

STORY_ID = "US-1780809919436"
SPEC_DICT = json.loads("{\"story_id\": \"US-1780809919436\", \"title\": \"Average Installments by Payment Type by Month\", \"intent\": \"aggregate\", \"source_tables\": [\"olist_orders_raw\", \"olist_order_payments_raw\"], \"target_table\": \"gold.average_installments_by_payment_type_monthly\", \"transformations\": [\"Join olist_orders_raw with olist_order_payments_raw on order_id\", \"Group by payment_type, year, month\", \"Calculate average_installments for each payment_type and month\"], \"acceptance_criteria\": [\"SELECT payment_type, year, month, AVG(installments) AS average_installments FROM gold.average_installments_by_payment_type_monthly WHERE year IN (2016, 2017, 2018) GROUP BY payment_type, year, month\", \"Check that the average_installments for 'credit_card' in January 2017 is correct\", \"Check that the average_installments for 'boleto' in December 2018 is correct\"], \"data_platform\": \"aws\", \"storage_format\": \"parquet\", \"glue_database_bronze\": \"bronze\", \"glue_database_gold\": \"gold\", \"orchestration\": \"mwaa_emr\", \"schema_context\": \"- TABLE olist_order_payments_raw (Glue bronze, parquet on S3): Payment rows per order (multiple payment types possible).. S3: s3://olist-etl-demo/bronze/olist_order_payments_raw/. Columns: order_id, payment_sequential, payment_type, payment_installments, payment_value. Join keys: order_id.\\n- TABLE olist_order_reviews_raw (Glue bronze, parquet on S3): Customer review scores and optional text per order.. S3: s3://olist-etl-demo/bronze/olist_order_reviews_raw/. Columns: review_id, order_id, review_score, review_comment_title, review_comment_message, review_creation_date, review_answer_timestamp. Join keys: order_id.\\n- TABLE olist_orders_raw (Glue bronze, parquet on S3): Core orders table. One row per order.. S3: s3://olist-etl-demo/bronze/olist_orders_raw/. Columns: order_id, customer_id, order_status, order_purchase_timestamp, order_approved_at, order_delivered_carrier_date, order_delivered_customer_date, order_estimated_delivery_date. Join keys: order_id, customer_id.\\n- TABLE olist_loyalty_points_raw (Glue bronze, parquet on S3): Test bronze table \u2014 customer loyalty points balance and tier.. S3: s3://olist-etl-demo/bronze/olist_loyalty_points_raw/. Columns: customer_id, points_balance, loyalty_tier, last_updated. Join keys: customer_id.\\n- TABLE olist_order_items_raw (Glue bronze, parquet on S3): Line items per order. Links orders, products, sellers.. S3: s3://olist-etl-demo/bronze/olist_order_items_raw/. Columns: order_id, order_item_id, product_id, seller_id, shipping_limit_date, price, freight_value. Join keys: order_id, product_id, seller_id.\\n- TABLE olist_promotions_raw (Glue bronze, parquet on S3): Test bronze table \u2014 product promotions and discount windows.. S3: s3://olist-etl-demo/bronze/olist_promotions_raw/. Columns: promotion_id, product_id, discount_pct, valid_from, valid_to. Join keys: promotion_id, product_id.\", \"source_table_columns\": {\"olist_orders_raw\": [\"customer_id\", \"order_approved_at\", \"order_delivered_carrier_date\", \"order_delivered_customer_date\", \"order_estimated_delivery_date\", \"order_id\", \"order_purchase_timestamp\", \"order_status\"], \"olist_order_payments_raw\": [\"order_id\", \"payment_installments\", \"payment_sequential\", \"payment_type\", \"payment_value\"]}, \"join_graph_hint\": \"Valid joins: orders->customers(customer_id); orders->order_items(order_id); order_items->products(product_id); order_items->sellers(seller_id); products->category_translation(product_category_name); orders->payments/reviews(order_id); sellers/customers zip->geolocation(geolocation_zip_code_prefix).\"}")


def test_spec_parses_to_etl_spec():
    spec = ETLSpec.model_validate(SPEC_DICT)
    assert spec.story_id == "US-1780809919436"
    assert spec.target_table == "gold.average_installments_by_payment_type_monthly"


def test_source_tables_in_allowlist():
    spec = ETLSpec.model_validate(SPEC_DICT)
    ev = StorySpecEvaluator().evaluate(spec)
    check = next(c for c in ev.checks if c.name == 'story_validation_source_tables')
    assert check.passed, check.message


def test_target_is_gold():
    spec = ETLSpec.model_validate(SPEC_DICT)
    assert spec.target_table.startswith('gold.')


def test_story_validation_passes():
    spec = ETLSpec.model_validate(SPEC_DICT)
    ev = StorySpecEvaluator().evaluate(spec)
    errors = [c for c in ev.checks if not c.passed and c.severity == 'error']
    assert not errors, '; '.join(c.message for c in errors)


def test_transformations_mention_join_key_order_id():
    spec = ETLSpec.model_validate(SPEC_DICT)
    blob = ' '.join(spec.transformations).lower()
    if 'order_items' in blob or 'order_item' in blob:
        assert 'order_id' in blob, 'Join on order_id required for orders + items'


def test_acceptance_does_not_reference_bronze_columns_on_gold():
    spec = ETLSpec.model_validate(SPEC_DICT)
    ev = StorySpecEvaluator().evaluate(spec)
    check = next(c for c in ev.checks if c.name == 'story_validation_acceptance_grain')
    assert check.passed, check.message


def test_expected_gold_columns_present_in_spec():
    import re
    spec = ETLSpec.model_validate(SPEC_DICT)
    blob = ' '.join(spec.transformations + spec.acceptance_criteria).lower()
    expected = ["average_installments", "month", "order_month", "order_year", "payment_type", "year"]
    aliases = {"order_year": ["order_year", "year"], "order_month": ["month", "order_month"], "year": ["order_year", "year"], "month": ["month", "order_month"], "average_installments": ["average_installments", "avg_installments", "payment_installments"], "payment_type": ["payment_type"]}
    for col in expected:
        names = aliases.get(col, [col])
        assert any(re.search(rf'\b{re.escape(a)}\b', blob) for a in names), (
            f'Expected gold column {col} in transformations or acceptance'
        )

