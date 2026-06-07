import os
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.functions import col, year, month, sum as _sum

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "quarterly_revenue_summary")

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


def main():
    spark = SparkSession.builder.appName("olist_etl_quarterly_revenue_summary").getOrCreate()

    # Read bronze tables
    orders = _read_bronze(spark, "olist_orders_raw")
    orders = orders.withColumn("order_purchase_timestamp", F.to_timestamp("order_purchase_timestamp"))
    items = _read_bronze(spark, "olist_order_items_raw")

    # Join orders and items
    revenue_df = orders.alias("o").join(items.alias("i"), "order_id")

    # Filter for delivered orders
    revenue_df = revenue_df.filter(col("o.order_status") == 'delivered')

    # Aggregate total revenue by quarter
    revenue_summary = revenue_df.groupBy(year(col("o.order_purchase_timestamp")).alias("year"),
        month(col("o.order_purchase_timestamp")).alias("month")
    ).agg(
        _sum(col("i.price") * col("i.order_item_id")).alias("revenue")
    )

    # Write gold table
    gold_prefix = f"s3://{os.environ['S3_DATA_BUCKET']}/{os.environ['S3_GOLD_PREFIX']}/{os.environ['TARGET_TABLE']}/"
    revenue_summary.write.mode("overwrite").parquet(gold_prefix)


if __name__ == "__main__":
    main()
