"""Auto-generated story spec tests — do not edit by hand."""
from __future__ import annotations

import json

import pytest

from src.models.etl_spec import ETLSpec
from src.evaluators.story_spec_evaluator import StorySpecEvaluator

STORY_ID = "US-AVG-ITEMS-MONTHLY"
SPEC_DICT = json.loads("{\"story_id\": \"US-AVG-ITEMS-MONTHLY\", \"title\": \"Average Items Per Order Monthly Summary\", \"intent\": \"aggregate\", \"source_tables\": [\"olist_orders_raw\", \"olist_order_items_raw\"], \"target_table\": \"gold.average_items_per_order_monthly\", \"transformations\": [\"join olist_orders_raw to olist_order_items_raw on order_id\", \"derive order_year and order_month from order_purchase_timestamp\", \"count order_item_id per order_id as items_in_order\", \"group by order_year, order_month and compute avg(items_in_order) as average_items_per_order\"], \"acceptance_criteria\": [\"average_items_per_order >= 1 for all rows\", \"order_month between 1 and 12\", \"order_year between 2016 and 2018\", \"no null order_year, order_month, or average_items_per_order\", \"one row per distinct order_year and order_month\"], \"data_platform\": \"aws\", \"storage_format\": \"parquet\", \"glue_database_bronze\": \"bronze\", \"glue_database_gold\": \"gold\", \"orchestration\": \"mwaa_emr\", \"schema_context\": \"- TABLE olist_order_items_raw (Glue bronze, parquet on S3): Line items per order. Links orders, products, sellers.. S3: s3://olist-etl-demo/bronze/olist_order_items_raw/. Columns: order_id, order_item_id, product_id, seller_id, shipping_limit_date, price, freight_value. Join keys: order_id, product_id, seller_id.\\n- TABLE olist_orders_raw (Glue bronze, parquet on S3): Core orders table. One row per order.. S3: s3://olist-etl-demo/bronze/olist_orders_raw/. Columns: order_id, customer_id, order_status, order_purchase_timestamp, order_approved_at, order_delivered_carrier_date, order_delivered_customer_date, order_estimated_delivery_date. Join keys: order_id, customer_id.\\n- TABLE olist_order_reviews_raw (Glue bronze, parquet on S3): Customer review scores and optional text per order.. S3: s3://olist-etl-demo/bronze/olist_order_reviews_raw/. Columns: review_id, order_id, review_score, review_comment_title, review_comment_message, review_creation_date, review_answer_timestamp. Join keys: order_id.\\n- TABLE olist_order_payments_raw (Glue bronze, parquet on S3): Payment rows per order (multiple payment types possible).. S3: s3://olist-etl-demo/bronze/olist_order_payments_raw/. Columns: order_id, payment_sequential, payment_type, payment_installments, payment_value. Join keys: order_id.\\n- TABLE olist_sellers_raw (Glue bronze, parquet on S3): Seller dimension.. S3: s3://olist-etl-demo/bronze/olist_sellers_raw/. Columns: seller_id, seller_zip_code_prefix, seller_city, seller_state. Join keys: seller_id.\\n- TABLE olist_products_raw (Glue bronze, parquet on S3): Product catalog with category and physical attributes.. S3: s3://olist-etl-demo/bronze/olist_products_raw/. Columns: product_id, product_category_name, product_name_lenght, product_description_lenght, product_photos_qty, product_weight_g, product_length_cm, product_height_cm, product_width_cm. Join keys: product_id, product_category_name.\", \"source_table_columns\": {\"olist_orders_raw\": [\"customer_id\", \"order_approved_at\", \"order_delivered_carrier_date\", \"order_delivered_customer_date\", \"order_estimated_delivery_date\", \"order_id\", \"order_purchase_timestamp\", \"order_status\"], \"olist_order_items_raw\": [\"freight_value\", \"order_id\", \"order_item_id\", \"price\", \"product_id\", \"seller_id\", \"shipping_limit_date\"]}, \"join_graph_hint\": \"Valid joins: orders->customers(customer_id); orders->order_items(order_id); order_items->products(product_id); order_items->sellers(seller_id); products->category_translation(product_category_name); orders->payments/reviews(order_id); sellers/customers zip->geolocation(geolocation_zip_code_prefix).\"}")


def test_spec_parses_to_etl_spec():
    spec = ETLSpec.model_validate(SPEC_DICT)
    assert spec.story_id == "US-AVG-ITEMS-MONTHLY"
    assert spec.target_table == "gold.average_items_per_order_monthly"


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
    spec = ETLSpec.model_validate(SPEC_DICT)
    blob = ' '.join(spec.transformations + spec.acceptance_criteria).lower()
    expected = ["average_items_per_order", "items_in_order", "order_month", "order_year"]
    for col in expected:
        assert col.replace('_', ' ') in blob.replace('_', ' ') or col in blob, (
            f'Expected gold column {col} in transformations or acceptance'
        )

