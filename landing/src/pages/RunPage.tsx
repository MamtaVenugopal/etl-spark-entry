import { Link, useLocation, useParams } from "react-router-dom";
import { RunTracker } from "@/components/RunTracker";
import type { RunState } from "@/lib/types";

export function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const location = useLocation();
  const state = location.state as { jira_sw_key?: string; title?: string } | null;

  if (!runId) {
    return (
      <div className="container mx-auto px-6 py-20 text-center">
        <p>Missing run id.</p>
        <Link to="/intake" className="text-agent-cyan hover:underline">
          Back to intake
        </Link>
      </div>
    );
  }

  const initialRun: Partial<RunState> = {
    status: "RUNNING",
    jira_sw_key: state?.jira_sw_key,
    title: state?.title,
  };

  return (
    <div className="container mx-auto px-6 py-12 max-w-4xl">
      <p className="font-mono text-xs text-muted-foreground mb-4">
        Run page · open at{" "}
        <span className="text-agent-cyan">
          {typeof window !== "undefined" ? `${window.location.origin}/runs/${runId}` : `/runs/${runId}`}
        </span>
      </p>
      <RunTracker runId={runId} initialRun={initialRun} />
    </div>
  );
}
