from pyspark.sql import SparkSession
from pyspark.sql import functions as F

def build_monthly_revenue_by_product_category(spark: SparkSession):
    # Load source tables
    products_df = spark.table('olist_ecommerce.bronze.olist_products_raw')
    category_translation_df = spark.table('olist_ecommerce.bronze.olist_category_translation_raw')

    # Aggregate sales data by product category and month
    revenue_df = products_df.groupBy(
        F.date_format('order_date', 'yyyy-MM').alias('month'),
        'product_category'
    ).agg(
        F.sum('revenue').alias('total_revenue')
    )

    # Join with category translation to ensure all categories are included
    result_df = revenue_df.join(
        category_translation_df,
        'product_category',
        'right'
    ).fillna(0)

    # Write to gold table
    result_df.write.format('delta').mode('overwrite').saveAsTable('catalog.gold.monthly_revenue_by_product_category')

if __name__ == '__main__':
    spark = SparkSession.builder.appName('olist_etl_monthly_revenue').getOrCreate()
    build_monthly_revenue_by_product_category(spark)