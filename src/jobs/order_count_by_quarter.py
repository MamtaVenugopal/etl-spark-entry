from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.functions import col, count, to_date, date_format
import os
BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze/raw")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "order_count_by_quarter")

_BRONZE_CSV = {
    "olist_orders_raw": "olist_orders_dataset.csv",
    "olist_order_items_raw": "olist_order_items_dataset.csv",
    "olist_products_raw": "olist_products_dataset.csv",
    "olist_category_translation_raw": "product_category_name_translation.csv",
    "olist_customers_raw": "olist_customers_dataset.csv",
    "olist_order_payments_raw": "olist_order_payments_dataset.csv",
    "olist_order_reviews_raw": "olist_order_reviews_dataset.csv",
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

# Helper function to read bronze data


def main():
    spark = SparkSession.builder.appName("Order Count by Quarter").getOrCreate()

    # Read source tables from bronze
    orders_df = _read_bronze(spark, "olist_orders_raw")
    orders_df = orders_df.withColumn("order_purchase_timestamp", F.to_timestamp("order_purchase_timestamp"))
    order_items_df = _read_bronze(spark, "olist_order_items_raw")
    products_df = _read_bronze(spark, "olist_products_raw")
    category_translation_df = _read_bronze(spark, "olist_category_translation_raw")

    # Join dataframes
    joined_df = orders_df.join(order_items_df, "order_id")
    joined_df = joined_df.join(products_df, "product_id")
    joined_df = joined_df.join(category_translation_df.alias("t"), "product_category_name", "left")

    # Aggregate orders by quarter and product category
    result_df = (joined_df
        .withColumn("order_purchase_timestamp", to_date(col("order_purchase_timestamp")))
        .withColumn("quarter", date_format(col("order_purchase_timestamp"), "Q"))
        .groupBy("quarter", "product_category_name")
        .agg(count("order_id").alias("total_order_count")))
    
    # Write result to gold
    gold_path = f"s3://{os.environ['S3_DATA_BUCKET']}/{os.environ['S3_GOLD_PREFIX']}/{os.environ['TARGET_TABLE']}"
    result_df.write.mode("overwrite").parquet(gold_path)

    spark.stop()

if __name__ == "__main__":
    main()
