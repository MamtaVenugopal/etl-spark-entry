from pyspark.sql import SparkSession
from pyspark.sql import functions as F
import os

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "average_items_per_order_monthly")

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
    spark = SparkSession.builder.appName("Average Items Per Order Monthly").getOrCreate()

    orders = _read_bronze(spark, "olist_orders_raw")
    orders = orders.withColumn(
        "order_purchase_timestamp", F.to_timestamp("order_purchase_timestamp")
    )
    items = _read_bronze(spark, "olist_order_items_raw")

    joined = orders.alias("o").join(items.alias("i"), "order_id")

    items_per_order = joined.groupBy("order_id", F.year("o.order_purchase_timestamp").alias("order_year"),
        F.month("o.order_purchase_timestamp").alias("order_month"),
    ).agg(F.count("i.order_item_id").alias("items_in_order"))

    result = items_per_order.groupBy("order_year", "order_month").agg(
        F.avg("items_in_order").alias("average_items_per_order")
    )

    result.write.mode("overwrite").parquet(
        f"s3://{BUCKET}/{GOLD_PREFIX}/{TARGET_TABLE}/"
    )

    spark.stop()


if __name__ == "__main__":
    main()
