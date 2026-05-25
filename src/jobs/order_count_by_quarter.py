"""Order count by quarter and product category (Olist CSV bronze → S3 gold Parquet)."""
import os

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze/raw")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "order_count_by_quarter")

_BRONZE_CSV = {
    "olist_orders_raw": "olist_orders_dataset.csv",
    "olist_order_items_raw": "olist_order_items_dataset.csv",
    "olist_products_raw": "olist_products_dataset.csv",
    "olist_category_translation_raw": "product_category_name_translation.csv",
}


def _bronze_path(table: str) -> str:
    return f"s3://{BUCKET}/{BRONZE_PREFIX}/{table}/"


def _gold_path() -> str:
    return f"s3://{BUCKET}/{GOLD_PREFIX}/{TARGET_TABLE}/"


def _read_bronze(spark: SparkSession, table: str):
    fmt = os.environ.get("BRONZE_FORMAT", "csv").lower()
    if fmt == "csv" and table in _BRONZE_CSV:
        path = f"s3://{BUCKET}/{BRONZE_PREFIX}/{_BRONZE_CSV[table]}"
        return spark.read.option("header", True).option("inferSchema", True).csv(path)
    return spark.read.parquet(_bronze_path(table))


def build_order_count_by_quarter(spark: SparkSession):
    orders = _read_bronze(spark, "olist_orders_raw")
    items = _read_bronze(spark, "olist_order_items_raw")
    products = _read_bronze(spark, "olist_products_raw")
    translation = _read_bronze(spark, "olist_category_translation_raw")

    orders = orders.withColumn(
        "order_purchase_timestamp",
        F.to_timestamp("order_purchase_timestamp"),
    )

    base = (
        orders.alias("o")
        .join(items.alias("i"), "order_id")
        .join(products.alias("p"), "product_id")
        .join(translation.alias("t"), "product_category_name", "left")
        .filter(F.col("o.order_purchase_timestamp").isNotNull())
    )

    with_q = base.withColumn(
        "order_year", F.year("o.order_purchase_timestamp")
    ).withColumn("order_quarter", F.quarter("o.order_purchase_timestamp"))

    result = (
        with_q.groupBy("order_year", "order_quarter", "t.product_category_name_english")
        .agg(F.countDistinct("o.order_id").alias("order_count"))
        .filter(F.col("product_category_name_english").isNotNull())
    )

    result.write.mode("overwrite").parquet(_gold_path())
    return result


def main():
    spark = (
        SparkSession.builder.appName("order_count_by_quarter")
        .getOrCreate()
    )
    build_order_count_by_quarter(spark)
    spark.stop()


if __name__ == "__main__":
    main()
