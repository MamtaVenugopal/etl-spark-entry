from pyspark.sql import SparkSession
from pyspark.sql.functions import col
import os

# Initialize Spark session
spark = SparkSession.builder.appName("olist_etl_test").getOrCreate()

# Environment variables
S3_DATA_BUCKET = os.getenv('S3_DATA_BUCKET')
S3_BRONZE_PREFIX = os.getenv('S3_BRONZE_PREFIX')
S3_GOLD_PREFIX = os.getenv('S3_GOLD_PREFIX')

# Read bronze data
olist_promotions_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_promotions_raw/')
olist_loyalty_points_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_loyalty_points_raw/')
olist_products_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_products_raw/')
olist_order_reviews_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_order_reviews_raw/')
olist_geolocation_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_geolocation_raw/')
olist_category_translation_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_category_translation_raw/')

# Transformations
# Join olist_promotions_raw and olist_products_raw on product_id
joined_promotions_products = olist_promotions_raw.join(olist_products_raw, "product_id")

# Join olist_loyalty_points_raw and olist_geolocation_raw on customer_id
joined_loyalty_geolocation = olist_loyalty_points_raw.join(olist_geolocation_raw, "customer_id")

# Aggregate data to create a summary for gold.test
# (Assuming some aggregation logic here, e.g., count, sum, etc.)
aggregated_data = joined_promotions_products.join(joined_loyalty_geolocation, "customer_id")
# Example aggregation (this should be replaced with actual logic)
final_data = aggregated_data.groupBy("some_column").agg({"another_column": "sum"})

# Write the aggregated data to gold.test in Parquet format
final_data.write.mode("overwrite").parquet(f's3://{S3_DATA_BUCKET}/{S3_GOLD_PREFIX}/gold.test/')

# Stop Spark session
spark.stop()