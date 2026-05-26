export type StoryPriority = "Low" | "Medium" | "High" | "Critical";

export type StructuredStory = {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  source: string;
  target: string;
  transformations: string[];
  acceptanceCriteria: string[];
  priority: StoryPriority;
  estimate?: string;
  source_tables?: string[];
  target_table?: string;
  intent?: string;
};

export type RunStep = {
  name?: string;
  state?: string;
  status?: string;
};

export type ResultPreview = {
  columns?: string[];
  rows?: Array<Record<string, unknown> | unknown[]>;
};

export type RunReport = {
  result_preview?: ResultPreview;
  profile_report?: { row_count?: number };
  artifacts?: {
    downloads?: Array<{ label: string; url: string }>;
  };
};

export type RunState = {
  run_id: string;
  story_id?: string;
  title?: string;
  status: string;
  current_step?: string;
  steps?: RunStep[];
  customer_run_url?: string;
  jira_sw_key?: string;
  jira_sd_key?: string;
  error?: string;
  gate_1_auto?: boolean;
  gate_1_confirmed?: boolean;
  gate_2_auto?: boolean;
  gate_2_approved?: boolean;
  result_preview?: ResultPreview;
  report?: RunReport;
  data_validation?: Array<{ name?: string; passed?: boolean; message?: string }>;
  outputs?: {
    customer_run_url?: string;
    pr_url?: string;
    pr_merged?: boolean;
    gold_s3_uri?: string;
    emr_job_flow_id?: string;
    blocking_questions?: string[];
    delivery_phase?: string;
    profile_report?: { row_count?: number };
    ydata_profile_html?: string;
    ydata_profile_s3_uri?: string;
    profile_report_url?: string;
    report_pdf_stored?: boolean;
  };
  evaluations?: Record<string, { passed?: boolean; summary?: string }>;
  parsed_spec?: Record<string, unknown>;
  test_files?: Array<{ path?: string }>;
};

export type SubmitStoryResponse = {
  run_id: string;
  status: string;
  jira_sw_key?: string;
  jira_sd_key?: string;
};

export type HealthResponse = {
  auto_gate_1?: boolean;
  auto_gate_2?: boolean;
};
