import os
from pyspark.sql import SparkSession

# Initialize Spark session
spark = SparkSession.builder.appName("Lovable Tunnel Test").getOrCreate()

# Environment variables
S3_DATA_BUCKET = os.getenv('S3_DATA_BUCKET')
S3_BRONZE_PREFIX = os.getenv('S3_BRONZE_PREFIX')
S3_GOLD_PREFIX = os.getenv('S3_GOLD_PREFIX')

# Read bronze data
olist_order_reviews_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_order_reviews_raw/')
olist_orders_raw = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_orders_raw/')

# Join and aggregate
result = olist_order_reviews_raw.join(olist_orders_raw, "order_id") \
    .groupBy("order_id") \
    .agg({"review_score": "avg", "price": "sum"}) \
    .withColumnRenamed("sum(price)", "total_revenue")

# Filter based on acceptance criteria
result = result.filter(result.total_revenue > 0)

# Write gold data
result.write.mode("overwrite").parquet(f's3://{S3_DATA_BUCKET}/{S3_GOLD_PREFIX}/gold.revenue_summary/')

# Stop Spark session
spark.stop()