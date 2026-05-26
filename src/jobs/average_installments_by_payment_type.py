from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.functions import avg, col
import os

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "average_installments_by_payment_type")

_BRONZE_CSV = {
    "olist_orders_raw": "olist_orders_dataset.csv",
    "olist_order_items_raw": "olist_order_items_dataset.csv",
    "olist_order_payments_raw": "olist_order_payments_dataset.csv",
    "olist_customers_raw": "olist_customers_dataset.csv",
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
    spark = SparkSession.builder.appName("Average Installments by Payment Type").getOrCreate()

    # Read bronze tables
    orders = _read_bronze(spark, 'olist_orders_raw')
    items = _read_bronze(spark, 'olist_order_items_raw')
    payments = _read_bronze(spark, 'olist_order_payments_raw')
    customers = _read_bronze(spark, 'olist_customers_raw')

    # Join tables
    result = (orders.alias('o')
        .join(items.alias('i'), 'order_id')
        .join(payments.alias('p'), 'order_id')
        .join(customers.alias('c'), 'customer_id')
    )

    # Group by payment_type and calculate average installments
    result = result.groupBy('p.payment_type').agg(avg('p.payment_installments').alias('average_installments'))

    # Write gold table
    result.write.mode("overwrite").parquet(f"s3://{BUCKET}/{GOLD_PREFIX}/{TARGET_TABLE}/")

    spark.stop()


if __name__ == '__main__':
    main()
