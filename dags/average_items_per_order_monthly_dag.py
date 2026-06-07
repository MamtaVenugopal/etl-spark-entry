from airflow import DAG
from airflow.providers.amazon.aws.operators.emr import EmrCreateJobFlowOperator, EmrAddStepsOperator, EmrTerminateJobFlowOperator
from datetime import datetime
import os

# Define the default arguments for the DAG
default_args = {
    'owner': 'airflow',
    'start_date': datetime(2023, 1, 1),
    'retries': 1,
}

# Create the DAG
with DAG('average_items_per_order_monthly_dag', default_args=default_args, schedule_interval='@monthly', catchup=False) as dag:

    # Create EMR cluster
    create_emr_cluster = EmrCreateJobFlowOperator(
        task_id='create_emr_cluster',
        job_flow_overrides={
            'Name': 'AverageItemsPerOrderMonthlyCluster',
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
        aws_conn_id='aws_default',
    )

    # Add steps to the EMR cluster
    add_steps = EmrAddStepsOperator(
        task_id='add_steps',
        job_flow_id=create_emr_cluster.output,
        steps=[
            {
                'Name': 'Run Average Items Per Order Monthly Job',
                'ActionOnFailure': 'CONTINUE',
                'HadoopJarStep': {
                    'Jar': 'command-runner.jar',
                    'Args': [
                        'spark-submit',
                        '--deploy-mode', 'cluster',
                        's3://{}/src/jobs/average_items_per_order_monthly.py'.format(os.environ.get('S3_DATA_BUCKET'))
                    ],
                },
            },
        ],
    )

    # Terminate the EMR cluster
    terminate_emr_cluster = EmrTerminateJobFlowOperator(
        task_id='terminate_emr_cluster',
        job_flow_id=create_emr_cluster.output,
    )

    # Set task dependencies
    create_emr_cluster >> add_steps >> terminate_emr_cluster
