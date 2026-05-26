"""
US-001 — Monthly Revenue Summary (AWS: S3 Parquet bronze → gold)
Uploaded to S3 by Agent 3; executed on EMR via Airflow DAG (Agent 2).
"""
import os
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze/raw")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "monthly_revenue_summary")


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
    fmt = os.environ.get("BRONZE_FORMAT", "parquet").lower()
    if fmt == "csv":
        name = _BRONZE_CSV[table]
        path = f"s3://{BUCKET}/{BRONZE_PREFIX}/{name}"
        return spark.read.option("header", True).option("inferSchema", True).csv(path)
    return spark.read.parquet(_bronze_path(table))


def build_monthly_revenue_summary(spark: SparkSession):
    orders = _read_bronze(spark, "olist_orders_raw")
    orders = orders.withColumn("order_purchase_timestamp", F.to_timestamp("order_purchase_timestamp"))
    items = _read_bronze(spark, "olist_order_items_raw")
    products = _read_bronze(spark, "olist_products_raw")
    translation = _read_bronze(spark, "olist_category_translation_raw")

    base = (
        orders.alias("o")
        .join(items.alias("i"), "order_id")
        .join(products.alias("p"), "product_id")
        .join(translation.alias("t"), "product_category_name", "left")
        .filter(F.col("o.order_status") == "delivered")
        .filter(F.col("i.price").isNotNull())
        .filter(F.col("o.order_purchase_timestamp").isNotNull())
    )

    with_dates = base.withColumn(
        "order_year", F.year("o.order_purchase_timestamp")
    ).withColumn("order_month", F.month("o.order_purchase_timestamp"))

    result = (
        with_dates.groupBy("order_year", "order_month", "t.product_category_name_english")
        .agg(
            F.sum("i.price").alias("total_revenue"),
            F.count("o.order_id").alias("total_orders"),
            F.avg("i.price").alias("avg_order_value"),
        )
        .filter(F.col("product_category_name_english").isNotNull())
    )

    result.write.mode("overwrite").parquet(_gold_path())
    return result


def main():
    spark = (
        SparkSession.builder.appName("US001_monthly_revenue_summary")
        .config("spark.sql.sources.partitionOverwriteMode", "dynamic")
        .getOrCreate()
    )
    build_monthly_revenue_summary(spark)
    spark.stop()


if __name__ == "__main__":
    main()
