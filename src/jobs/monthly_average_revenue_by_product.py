from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.functions import col, year, month, sum as _sum
import os

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "monthly_average_revenue_by_product")

_BRONZE_CSV = {
    "olist_orders_raw": "olist_orders_dataset.csv",
    "olist_order_items_raw": "olist_order_items_dataset.csv",
}


def _bronze_path(table: str) -> str:
    return f"s3://{BUCKET}/{BRONZE_PREFIX}/{table}/"


def _read_bronze(spark, table: str):
    fmt = os.environ.get("BRONZE_FORMAT", "csv").lower()
    if fmt == "csv" and table in _BRONZE_CSV:
        path = f"s3://{BUCKET}/{BRONZE_PREFIX}/{_BRONZE_CSV[table]}"
        return spark.read.option("header", True).option("inferSchema", True).csv(path)
    return spark.read.parquet(_bronze_path(table))


def main(spark):
    # Read bronze tables
    orders = _read_bronze(spark, 'olist_orders_raw')
    orders = orders.withColumn("order_purchase_timestamp", F.to_timestamp("order_purchase_timestamp"))
    items = _read_bronze(spark, 'olist_order_items_raw')

    # Join orders and items
    joined_df = orders.alias('o').join(items.alias('i'), 'order_id')

    # Filter delivered orders
    filtered_df = joined_df.filter(col('o.order_status') == 'delivered')

    # Aggregate revenue
    revenue_df = filtered_df.groupBy(year(col('o.order_purchase_timestamp')).alias('year'),
        month(col('o.order_purchase_timestamp')).alias('month'),
        col('i.product_id')
    ).agg(
        _sum(col('i.price')).alias('total_revenue')
    )

    # Write gold table
    output_path = f"s3://{BUCKET}/{GOLD_PREFIX}/{TARGET_TABLE}/"
    revenue_df.write.mode('overwrite').parquet(output_path)


if __name__ == '__main__':
    spark = SparkSession.builder.appName('MonthlyAverageRevenueByProduct').getOrCreate()
    main(spark)
    spark.stop()
