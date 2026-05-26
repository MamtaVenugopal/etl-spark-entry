from airflow import DAG
from airflow.providers.amazon.aws.operators.emr import EmrCreateJobFlowOperator, EmrAddStepsOperator, EmrTerminateJobFlowOperator
from datetime import datetime
import os

# Define the default arguments for the DAG
default_args = {
    'owner': 'airflow',
    'start_date': datetime(2023, 10, 1),
    'retries': 1,
}

# Define the DAG
with DAG('average_installments_by_payment_type_dag', default_args=default_args, schedule_interval='@daily', catchup=False) as dag:

    # Create an EMR cluster
    create_cluster = EmrCreateJobFlowOperator(
        task_id='create_cluster',
        job_flow_overrides={
            'Name': 'Average Installments EMR Cluster',
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
            },
            'Applications': [
                {'Name': 'Spark'},
            ],
            'VisibleToAllUsers': True,
            'JobFlowRole': 'EMR_EC2_DefaultRole',
            'ServiceRole': 'EMR_DefaultRole',
        },
    )

    # Add steps to the EMR cluster
    add_steps = EmrAddStepsOperator(
        task_id='add_steps',
        job_flow_id=create_cluster.output,
        steps=[
            {
                'Name': 'Run Average Installments Job',
                'ActionOnFailure': 'CONTINUE',
                'HadoopJarStep': {
                    'Jar': 'command-runner.jar',
                    'Args': [
                        'spark-submit',
                        '--deploy-mode', 'cluster',
                        's3://{}/src/jobs/average_installments_by_payment_type.py'.format(os.environ.get('S3_DATA_BUCKET'))
                    ],
                },
            },
        ],
    )

    # Terminate the EMR cluster
    terminate_cluster = EmrTerminateJobFlowOperator(
        task_id='terminate_cluster',
        job_flow_id=create_cluster.output,
    )

    # Set task dependencies
    create_cluster >> add_steps >> terminate_cluster
