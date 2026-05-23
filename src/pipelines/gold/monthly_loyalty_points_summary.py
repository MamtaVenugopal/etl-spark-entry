from pyspark.sql import SparkSession
from pyspark.sql import functions as F

def build_monthly_loyalty_points_summary(spark: SparkSession):
    # Load source tables
    loyalty_points_df = spark.table('olist_ecommerce.bronze.olist_loyalty_points_raw')
    products_df = spark.table('olist_ecommerce.bronze.olist_products_raw')

    # Transformations
    # 1. Aggregate loyalty points by product and month
    monthly_loyalty_points = loyalty_points_df.groupBy(
        F.year('loyalty_date').alias('year'),
        F.month('loyalty_date').alias('month'),
        'product_id'
    ).agg(
        F.sum('loyalty_points').alias('total_loyalty_points')
    )

    # 2. Join with product catalog for product details
    result_df = monthly_loyalty_points.join(
        products_df,
        'product_id',
        'inner'
    ).select(
        'year', 'month', 'product_id', 'product_name', 'product_category', 'total_loyalty_points'
    )

    # Write to gold table
    result_df.write.format('delta').mode('overwrite').saveAsTable('catalog.gold.monthly_loyalty_points_summary')

if __name__ == '__main__':
    spark = SparkSession.builder.appName('olist_etl_monthly_loyalty_points_summary').getOrCreate()
    build_monthly_loyalty_points_summary(spark)