from pyspark.sql import SparkSession
from pyspark.sql.functions import col, month, year, count
import os

# Initialize Spark session
spark = SparkSession.builder.appName("Product Category Order Count").getOrCreate()

# Environment variables
S3_DATA_BUCKET = os.getenv('S3_DATA_BUCKET')
S3_BRONZE_PREFIX = os.getenv('S3_BRONZE_PREFIX')
S3_GOLD_PREFIX = os.getenv('S3_GOLD_PREFIX')

# Read bronze data
olist_orders_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_orders_raw/')
olist_order_items_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_order_items_raw/')
olist_products_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_products_raw/')
olist_category_translation_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_category_translation_raw/')

# Join data
joined_df = olist_orders_raw \
    .join(olist_order_items_raw, "order_id") \
    .join(olist_products_raw, "product_id") \
    .join(olist_category_translation_raw, "product_category_name")

# Aggregate data
result_df = joined_df.groupBy(
    col('product_category_name'),
    year('order_purchase_timestamp').alias('year'),
    month('order_purchase_timestamp').alias('month')
).agg(count('order_id').alias('total_order_count'))

# Write gold data
result_df.write.mode("overwrite").parquet(f's3://{S3_DATA_BUCKET}/{S3_GOLD_PREFIX}/product_category_order_count_month/')

# Stop Spark session
spark.stop()