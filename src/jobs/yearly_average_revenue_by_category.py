from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.functions import avg, year, col
import os
BUCKET = os.environ.get("S3_DATA_BUCKET", "olist-ecommerce-raw-2026")
BRONZE_PREFIX = os.environ.get("S3_BRONZE_PREFIX", "bronze/raw")
GOLD_PREFIX = os.environ.get("S3_GOLD_PREFIX", "gold")
TARGET_TABLE = os.environ.get("TARGET_TABLE", "yearly_average_revenue_by_category")

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

BRONZE_FORMAT = os.getenv('BRONZE_FORMAT')
S3_DATA_BUCKET = os.getenv('S3_DATA_BUCKET')
S3_BRONZE_PREFIX = os.getenv('S3_BRONZE_PREFIX')
S3_GOLD_PREFIX = os.getenv('S3_GOLD_PREFIX')
TARGET_TABLE = os.getenv('TARGET_TABLE')



def main(spark):
    # Read bronze tables
    orders = _read_bronze(spark, 'olist_orders_raw')
    orders = orders.withColumn("order_purchase_timestamp", F.to_timestamp("order_purchase_timestamp"))
    items = _read_bronze(spark, 'olist_order_items_raw')
    products = _read_bronze(spark, 'olist_products_raw')
    translation = _read_bronze(spark, 'olist_category_translation_raw')

    # Join tables
    result = (orders.alias('o')
        .join(items.alias('i'), 'order_id')
        .join(products.alias('p'), 'product_id')
        .join(translation.alias('t'), 'product_category_name', 'left')
    )

    # Filter completed orders
    result = result.filter(col('o.order_status') == 'delivered')

    # Group by category and year
    result = (result.withColumn('year', year(col('o.order_purchase_timestamp')))
        .groupBy('t.product_category_name_english', 'year')
        .agg(avg('i.price').alias('average_revenue'))
    )

    # Write gold table
    result.write.mode("overwrite").parquet(f"s3://{BUCKET}/{GOLD_PREFIX}/{TARGET_TABLE}/")


if __name__ == '__main__':
    spark = SparkSession.builder.appName('Yearly Average Revenue by Product Category').getOrCreate()
    main(spark)
    spark.stop()
