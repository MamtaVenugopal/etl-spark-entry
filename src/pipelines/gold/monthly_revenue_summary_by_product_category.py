from pyspark.sql import SparkSession
from pyspark.sql import functions as F

def build_monthly_revenue_summary_by_product_category(spark: SparkSession):
    # Load source tables
    products_df = spark.table('olist_ecommerce.bronze.olist_products_raw')
    category_translation_df = spark.table('olist_ecommerce.bronze.olist_category_translation_raw')

    # Join products with category translation
    joined_df = products_df.join(
        category_translation_df,
        products_df.category_id == category_translation_df.category_id,
        'left'
    )

    # Aggregate sales data by product category and month
    revenue_summary_df = joined_df.groupBy(
        F.date_format('order_date', 'yyyy-MM').alias('month'),
        'category_name'
    ).agg(
        F.sum('revenue').alias('total_revenue')
    )

    # Write to gold table
    revenue_summary_df.write.format('delta').mode('overwrite').saveAsTable('catalog.gold.monthly_revenue_summary_by_product_category')

if __name__ == '__main__':
    spark = SparkSession.builder.appName('olist_etl_monthly_revenue_summary').getOrCreate()
    build_monthly_revenue_summary_by_product_category(spark)