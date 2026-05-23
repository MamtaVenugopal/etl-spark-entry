from pyspark.sql import SparkSession
from pyspark.sql import functions as F


def build_quarterly_loyalty_points_per_product(spark: SparkSession):
    # Load source tables
    loyalty_points_df = spark.table('olist_ecommerce.bronze.olist_loyalty_points_raw')
    products_df = spark.table('olist_ecommerce.bronze.olist_products_raw')

    # Transformations
    # 1. Aggregate loyalty points by product and quarter
    quarterly_loyalty_df = loyalty_points_df.groupBy(
        F.year('loyalty_date').alias('year'),
        F.quarter('loyalty_date').alias('quarter'),
        'product_id'
    ).agg(
        F.sum('loyalty_points').alias('total_loyalty_points')
    )

    # 2. Join with product catalog for product details
    result_df = quarterly_loyalty_df.join(
        products_df,
        'product_id',
        'left'
    )

    # Write to gold table
    result_df.write.format('delta').mode('overwrite').saveAsTable('catalog.gold.quarterly_loyalty_points_per_product')


if __name__ == '__main__':
    spark = SparkSession.builder.appName('olist_etl_quarterly_loyalty_points').getOrCreate()
    build_quarterly_loyalty_points_per_product(spark)