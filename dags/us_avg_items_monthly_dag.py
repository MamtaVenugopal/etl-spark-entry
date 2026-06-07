from airflow import DAG
from airflow.providers.amazon.aws.operators.emr import EmrCreateJobFlowOperator, EmrAddStepsOperator, EmrTerminateJobFlowOperator
from datetime import datetime
import os

# Define the default_args dictionary
default_args = {
    'owner': 'airflow',
    'start_date': datetime(2023, 10, 1),
    'retries': 1,
}

# Create the DAG
with DAG('us_avg_items_monthly_dag', default_args=default_args, schedule_interval='@monthly', catchup=False) as dag:
    # Create the EMR cluster
    job_flow_creator = EmrCreateJobFlowOperator(
        task_id='create_emr_cluster',
        job_flow_overrides={
            'Name': 'Average Items Per Order Monthly',
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
            'Applications': [
                {'Name': 'Spark'},
            ],
        },
    )

    # Add steps to the EMR cluster
    step_adder = EmrAddStepsOperator(
        task_id='add_steps',
        job_flow_id=job_flow_creator.output,
        steps=[
            {
                'Name': 'Spark Job',
                'ActionOnFailure': 'CONTINUE',
                'HadoopJarStep': {
                    'Jar': 'command-runner.jar',
                    'Args': [
                        'spark-submit',
                        '--deploy-mode', 'cluster',
                        's3://{}/src/jobs/us_avg_items_monthly.py'.format(os.environ.get('S3_DATA_BUCKET')),
                    ],
                },
            },
        ],
    )

    # Terminate the EMR cluster
    job_flow_terminator = EmrTerminateJobFlowOperator(
        task_id='terminate_emr_cluster',
        job_flow_id=job_flow_creator.output,
    )

    # Set task dependencies
    job_flow_creator >> step_adder >> job_flow_terminator