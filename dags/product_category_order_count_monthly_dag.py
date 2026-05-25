from airflow import DAG
from airflow.providers.amazon.aws.operators.emr import EmrCreateJobFlowOperator, EmrAddStepsOperator, EmrTerminateJobFlowOperator
from airflow.utils.dates import days_ago

# Define default args
default_args = {
    'owner': 'airflow',
    'start_date': days_ago(1),
}

# Define the DAG
with DAG('product_category_order_count_monthly_dag', default_args=default_args, schedule_interval='@monthly') as dag:
    # Create EMR cluster
    create_job_flow = EmrCreateJobFlowOperator(
        task_id='create_job_flow',
        job_flow_overrides={
            'Name': 'ProductCategoryOrderCountMonthly',
            'ReleaseLabel': 'emr-6.3.0',
            'Instances': {
                'InstanceGroups': [
                    {
                        'Name': 'Master',
                        'InstanceRole': 'MASTER',
                        'InstanceType': 'm5.xlarge',
                        'InstanceCount': 1,
                    },
                    {
                        'Name': 'Core',
                        'InstanceRole': 'CORE',
                        'InstanceType': 'm5.xlarge',
                        'InstanceCount': 2,
                    },
                ],
                'KeepJobFlowAliveWhenNoSteps': False,
                'TerminationProtected': False,
            },
        },
    )

    # Add steps to the EMR cluster
    add_steps = EmrAddStepsOperator(
        task_id='add_steps',
        job_flow_id=create_job_flow.output,
        steps=[
            {
                'Name': 'Spark job',
                'ActionOnFailure': 'CONTINUE',
                'HadoopJarStep': {
                    'Jar': 'command-runner.jar',
                    'Args': [
                        'spark-submit',
                        '--deploy-mode', 'cluster',
                        's3://{{ var.value.S3_DATA_BUCKET }}/src/jobs/product_category_order_count_monthly.py',
                    ],
                },
            },
        ],
    )

    # Terminate the EMR cluster
    terminate_job_flow = EmrTerminateJobFlowOperator(
        task_id='terminate_job_flow',
        job_flow_id=create_job_flow.output,
    )

    # Set task dependencies
    create_job_flow >> add_steps >> terminate_job_flow