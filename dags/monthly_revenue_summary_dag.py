"""
US-1781895990532 — MWAA Airflow DAG: create EMR cluster → run Spark job → terminate cluster.

Set Airflow Variables: spark_script_s3_uri, emr_release_label, emr_* roles.
"""
from datetime import datetime, timedelta

from airflow import DAG
from airflow.providers.amazon.aws.operators.emr import (
    EmrAddStepsOperator,
    EmrCreateJobFlowOperator,
    EmrTerminateJobFlowOperator,
)

STORY_ID = "US-1781895990532"
TARGET_TABLE = "monthly_revenue_summary"
SPARK_SCRIPT_S3 = "{{ var.value.spark_script_s3_uri }}"
SPARK_JOB = "src/jobs/monthly_revenue_summary.py"

default_args = {
    "owner": "etl-agent",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

JOB_FLOW_OVERRIDES = {
    "Name": f"etl-{STORY_ID}-{{{ ds }}}",
    "ReleaseLabel": "{{ var.value.emr_release_label }}",
    "Applications": [{"Name": "Spark"}],
    "Instances": {
        "InstanceGroups": [
            {
                "Name": "Master",
                "Market": "ON_DEMAND",
                "InstanceRole": "MASTER",
                "InstanceType": "{{ var.value.emr_master_instance_type }}",
                "InstanceCount": 1,
            },
            {
                "Name": "Core",
                "Market": "ON_DEMAND",
                "InstanceRole": "CORE",
                "InstanceType": "{{ var.value.emr_core_instance_type }}",
                "InstanceCount": int("{{ var.value.emr_core_instance_count }}"),
            },
        ],
        "KeepJobFlowAliveWhenNoSteps": True,
        "TerminationProtected": False,
    },
    "VisibleToAllUsers": True,
    "JobFlowRole": "{{ var.value.emr_service_role }}",
    "ServiceRole": "{{ var.value.emr_service_role }}",
    "LogUri": "{{ var.value.emr_log_uri }}",
}

SPARK_STEPS = [
    {
        "Name": "monthly_revenue_summary",
        "ActionOnFailure": "TERMINATE_CLUSTER",
        "HadoopJarStep": {
            "Jar": "command-runner.jar",
            "Args": [
                "spark-submit",
                "--deploy-mode",
                "cluster",
                SPARK_SCRIPT_S3,
            ],
        },
    }
]

with DAG(
    dag_id="monthly_revenue_summary",
    default_args=default_args,
    description="US-1781895990532 Monthly Revenue Summary for Q1 (EMR + S3 Parquet)",
    schedule_interval=None,
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["olist", "gold", STORY_ID],
) as dag:
    create_cluster = EmrCreateJobFlowOperator(
        task_id="create_emr_cluster",
        job_flow_overrides=JOB_FLOW_OVERRIDES,
        aws_conn_id="aws_default",
    )

    run_spark = EmrAddStepsOperator(
        task_id="run_spark_job",
        job_flow_id="{{ task_instance.xcom_pull(task_ids='create_emr_cluster', key='return_value') }}",
        steps=SPARK_STEPS,
        aws_conn_id="aws_default",
    )

    terminate_cluster = EmrTerminateJobFlowOperator(
        task_id="terminate_emr_cluster",
        job_flow_id="{{ task_instance.xcom_pull(task_ids='create_emr_cluster', key='return_value') }}",
        aws_conn_id="aws_default",
    )

    create_cluster >> run_spark >> terminate_cluster
