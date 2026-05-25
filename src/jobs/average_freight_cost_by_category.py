import os
from pyspark.sql import SparkSession

# Initialize Spark session
spark = SparkSession.builder.appName("AverageFreightCostByCategory").getOrCreate()

# Environment variables
S3_DATA_BUCKET = os.getenv('S3_DATA_BUCKET')
S3_BRONZE_PREFIX = os.getenv('S3_BRONZE_PREFIX')
S3_GOLD_PREFIX = os.getenv('S3_GOLD_PREFIX')

# Read bronze data
order_items_df = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_order_items_raw/')
products_df = spark.read.parquet(f's3://{S3_DATA_BUCKET}/{S3_BRONZE_PREFIX}/olist_products_raw/')

# Join dataframes
joined_df = order_items_df.join(products_df, "product_id")

# Group by product category and calculate average freight cost
result_df = joined_df.groupBy("product_category_name").agg({"freight_value": "avg"}).withColumnRenamed("avg(freight_value)", "avg_freight_cost")

# Write gold data
result_df.write.mode("overwrite").parquet(f's3://{S3_DATA_BUCKET}/{S3_GOLD_PREFIX}/average_freight_cost_by_category/')

# Stop Spark session
spark.stop()