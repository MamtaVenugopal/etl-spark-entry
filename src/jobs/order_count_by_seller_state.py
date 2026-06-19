from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.functions import countDistinct
import os

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "order_count_by_seller_state")

_BRONZE_CSV = {
    "olist_orders_raw": "olist_orders_dataset.csv",
    "olist_order_items_raw": "olist_order_items_dataset.csv",
    "olist_sellers_raw": "olist_sellers_dataset.csv",
}


def _bronze_path(table: str) -> str:
    return f"s3://{BUCKET}/{BRONZE_PREFIX}/{table}/"


def _read_bronze(spark, table: str):
    fmt = os.environ.get("BRONZE_FORMAT", "csv").lower()
    if fmt == "csv" and table in _BRONZE_CSV:
        path = f"s3://{BUCKET}/{BRONZE_PREFIX}/{_BRONZE_CSV[table]}"
        return spark.read.option("header", True).option("inferSchema", True).csv(path)
    return spark.read.parquet(_bronze_path(table))


def main():
    spark = SparkSession.builder.appName('OrderCountBySellerState').getOrCreate()

    # Read bronze tables
    orders = _read_bronze(spark, 'olist_orders_raw')
    items = _read_bronze(spark, 'olist_order_items_raw')
    sellers = _read_bronze(spark, 'olist_sellers_raw')

    # Perform joins
    result = (
        orders.alias('o')
        .join(items.alias('i'), 'order_id')
        .join(sellers.alias('s'), 'seller_id')
        .groupBy('s.seller_state')
        .agg(countDistinct('o.order_id').alias('total_orders'))
    )

    # Write gold table
    result.write.mode("overwrite").parquet(f"s3://{BUCKET}/{GOLD_PREFIX}/{TARGET_TABLE}/")


if __name__ == '__main__':
    main()
