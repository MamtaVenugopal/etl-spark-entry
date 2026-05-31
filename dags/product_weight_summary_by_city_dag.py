from airflow import DAG
from airflow.providers.amazon.aws.operators.emr import EmrCreateJobFlowOperator, EmrAddStepsOperator, EmrTerminateJobFlowOperator
from airflow.utils.dates import days_ago
import os

# Define the default arguments for the DAG
default_args = {
    'owner': 'airflow',
    'start_date': days_ago(1),
}

# Define the EMR cluster configuration
job_flow_overrides = {
    'Name': 'Olist ETL Cluster',
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
}

# Define the steps to run the Spark job
spark_step = {
    'Name': 'Run Product Weight Summary by City',
    'ActionOnFailure': 'CONTINUE',
    'HadoopJarStep': {
        'Jar': 'command-runner.jar',
        'Args': [
            'spark-submit',
            '--deploy-mode', 'cluster',
            's3://{}/src/jobs/product_weight_summary_by_city.py'.format(os.environ.get('S3_DATA_BUCKET'))
        ],
    },
}

# Create the DAG
with DAG('product_weight_summary_by_city_dag', default_args=default_args, schedule_interval='@daily') as dag:
    create_job_flow = EmrCreateJobFlowOperator(
        task_id='create_job_flow',
        job_flow_overrides=job_flow_overrides,
    )

    add_steps = EmrAddStepsOperator(
        task_id='add_steps',
        job_flow_id=create_job_flow.output,
        steps=[spark_step],
    )

    terminate_job_flow = EmrTerminateJobFlowOperator(
        task_id='terminate_job_flow',
        job_flow_id=create_job_flow.output,
        trigger_rule='all_done',
    )

    create_job_flow >> add_steps >> terminate_job_flow