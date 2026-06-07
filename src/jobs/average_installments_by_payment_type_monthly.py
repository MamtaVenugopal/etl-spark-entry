from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.functions import year, month, avg
import os

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "average_installments_by_payment_type_monthly")

_BRONZE_CSV = {
    "olist_orders_raw": "olist_orders_dataset.csv",
    "olist_order_payments_raw": "olist_order_payments_dataset.csv",
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
    spark = SparkSession.builder.appName('Average Installments by Payment Type by Month').getOrCreate()

    # Read bronze tables
    orders = _read_bronze(spark, 'olist_orders_raw')
    orders = orders.withColumn("order_purchase_timestamp", F.to_timestamp("order_purchase_timestamp"))
    payments = _read_bronze(spark, 'olist_order_payments_raw')

    # Join tables
    joined_df = orders.alias('o').join(payments.alias('p'), 'order_id')

    # Extract year and month from order_purchase_timestamp
    result_df = joined_df.withColumn('year', year('o.order_purchase_timestamp'))
    result_df = result_df.withColumn('month', month('o.order_purchase_timestamp'))

    # Group by payment_type, year, month and calculate average_installments
    final_df = result_df.groupBy('p.payment_type', 'year', 'month')
    final_df = final_df.agg(avg('p.payment_installments').alias('average_installments'))

    # Write gold table
    final_df.write.mode("overwrite").parquet(f"s3://{BUCKET}/{GOLD_PREFIX}/{TARGET_TABLE}/")


if __name__ == '__main__':
    main()
