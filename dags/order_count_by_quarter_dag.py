from airflow import DAG
from airflow.providers.amazon.aws.operators.emr import EmrCreateJobFlowOperator, EmrAddStepsOperator, EmrTerminateJobFlowOperator
from datetime import datetime

# Define the default_args dictionary
default_args = {
    'owner': 'airflow',
    'start_date': datetime(2023, 10, 1),
    'retries': 1,
}

# Define the DAG
with DAG('order_count_by_quarter_dag', default_args=default_args, schedule_interval='@daily', catchup=False) as dag:
    # Create EMR cluster
    create_cluster = EmrCreateJobFlowOperator(
        task_id='create_emr_cluster',
        job_flow_overrides={
            'Name': 'OrderCountByQuarterCluster',
            'ReleaseLabel': 'emr-6.3.0',
            'Instances': {
                'InstanceGroups': [
                    {
                        'Name': 'Master',
                        'InstanceRole': 'MASTER',
                        'InstanceType': 'm5.xlarge',
                        'InstanceCount': 1
                    },
                    {
                        'Name': 'Core',
                        'InstanceRole': 'CORE',
                        'InstanceType': 'm5.xlarge',
                        'InstanceCount': 2
                    }
                ],
                'KeepJobFlowAliveWhenNoSteps': False,
                'TerminationProtected': False
            },
            'Applications': [
                {'Name': 'Spark'}
            ]
        }
    )

    # Add steps to the EMR cluster
    add_steps = EmrAddStepsOperator(
        task_id='add_spark_steps',
        job_flow_id=create_cluster.output,
        steps=[
            {
                'Name': 'Spark Job',
                'ActionOnFailure': 'CONTINUE',
                'HadoopJarStep': {
                    'Jar': 'command-runner.jar',
                    'Args': [
                        'bash', '-c',
                        (
                            'export S3_DATA_BUCKET="{{ var.value.S3_DATA_BUCKET }}"; '
                            'export S3_BRONZE_PREFIX="bronze/raw"; '
                            'export S3_GOLD_PREFIX="gold"; '
                            'export TARGET_TABLE="order_count_by_quarter"; '
                            'export BRONZE_FORMAT="csv"; '
                            'spark-submit --deploy-mode cluster '
                            's3://{{ var.value.S3_DATA_BUCKET }}/src/jobs/order_count_by_quarter.py'
                        ),
                    ]
                }
            }
        ]
    )

    # Terminate the EMR cluster
    terminate_cluster = EmrTerminateJobFlowOperator(
        task_id='terminate_emr_cluster',
        job_flow_id=create_cluster.output
    )

    # Set task dependencies
    create_cluster >> add_steps >> terminate_cluster