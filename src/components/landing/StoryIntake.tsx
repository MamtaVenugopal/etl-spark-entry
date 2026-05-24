import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { refineEtlStory } from "@/lib/refine-story.functions";
import type { EtlStory } from "@/lib/etl-story.schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Sparkles, Send } from "lucide-react";
import { RunStatus, type RunState } from "./RunStatus";

const PLACEHOLDER = `e.g. We need to ingest daily Salesforce opportunity data into Snowflake. Mask PII fields, join with HubSpot leads on email, and surface a refreshed table by 8am UTC. Analysts will use it for revenue dashboards.`;

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export function StoryIntake() {
  const [autoGates, setAutoGates] = useState(false);

  useEffect(() => {
    if (!API_BASE) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/health`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (!r.ok) return;
        const h = (await r.json()) as { auto_gate_1?: boolean; auto_gate_2?: boolean };
        setAutoGates(Boolean(h.auto_gate_1 && h.auto_gate_2));
      } catch (e) {
        console.warn("health check failed", e);
      }
    })();
  }, []);
  const refine = useServerFn(refineEtlStory);

  const [raw, setRaw] = useState("");
  const [story, setStory] = useState<EtlStory | null>(null);
  const [refining, setRefining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);

  async function handleRefine() {
    if (raw.trim().length < 20) {
      toast.error("Please add at least 20 characters describing your story.");
      return;
    }
    setRefining(true);
    setRun(null);
    try {
      const res = await refine({ data: { raw } });
      if (res.error || !res.story) {
        toast.error(res.error ?? "Could not refine story.");
      } else {
        setStory(res.story);
        toast.success("Story refined. Review and ship.");
      }
    } finally {
      setRefining(false);
    }
  }

  async function handleSubmit() {
    if (!story) return;
    if (!API_BASE) {
      toast.error("VITE_API_BASE_URL is not configured.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        story_id: "US-" + Date.now(),
        title: story.title,
        input_mode: "yaml",
        content: JSON.stringify(story),
      };
      const res = await fetch(`${API_BASE}/stories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        toast.error(`Submit failed (${res.status}): ${txt.slice(0, 200)}`);
        return;
      }
      const data = (await res.json()) as { run_id?: string; id?: string };
      const runId = data.run_id ?? data.id;
      if (!runId) {
        toast.error("No run_id returned from API.");
        return;
      }
      setRun({ run_id: runId, status: "PENDING" });
      toast.success(`Submitted. Tracking run ${runId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof EtlStory>(k: K, v: EtlStory[K]) {
    setStory((s) => (s ? { ...s, [k]: v } : s));
  }

  return (
    <section id="intake" className="container mx-auto px-6 py-20">
      <div className="max-w-3xl mx-auto">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Tell the agent your <span className="text-gradient-agent">user story</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Free-text in. Structured story out. Tracked end-to-end via the agent runtime.
          </p>
        </div>

        <div
          className="mt-10 rounded-2xl border border-white/10 bg-card/40 backdrop-blur p-6 md:p-8"
          style={{ boxShadow: "var(--shadow-glow-cyan)" }}
        >
          <Label htmlFor="raw" className="font-mono text-xs tracking-widest text-agent-cyan">
            RAW STORY
          </Label>
          <Textarea
            id="raw"
            value={raw}
            onChange={(e) => setRaw(e.target.value.slice(0, 4000))}
            placeholder={PLACEHOLDER}
            className="mt-2 min-h-[160px] bg-background/40 border-white/10 font-mono text-sm"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-muted-foreground font-mono">{raw.length}/4000</div>
            <Button
              onClick={handleRefine}
              disabled={refining}
              className="relative overflow-hidden border border-white/15"
              style={{ background: "var(--gradient-agent)" }}
            >
              {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {refining ? "Refining…" : "Refine with AI"}
            </Button>
          </div>
        </div>

        {story && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-card/40 backdrop-blur p-6 md:p-8 space-y-5">
            <div className="font-mono text-xs tracking-widest text-agent-cyan">
              STRUCTURED STORY · EDITABLE
            </div>

            <Field label="Title">
              <Input value={story.title} onChange={(e) => update("title", e.target.value)} />
            </Field>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="As a">
                <Input value={story.asA} onChange={(e) => update("asA", e.target.value)} />
              </Field>
              <Field label="I want">
                <Input value={story.iWant} onChange={(e) => update("iWant", e.target.value)} />
              </Field>
              <Field label="So that">
                <Input value={story.soThat} onChange={(e) => update("soThat", e.target.value)} />
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Source">
                <Input value={story.source} onChange={(e) => update("source", e.target.value)} />
              </Field>
              <Field label="Target">
                <Input value={story.target} onChange={(e) => update("target", e.target.value)} />
              </Field>
            </div>
            <Field label="Transformations (one per line)">
              <Textarea
                value={story.transformations.join("\n")}
                onChange={(e) =>
                  update(
                    "transformations",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  )
                }
                className="min-h-[100px] font-mono text-sm"
              />
            </Field>
            <Field label="Acceptance Criteria (one per line)">
              <Textarea
                value={story.acceptanceCriteria.join("\n")}
                onChange={(e) =>
                  update(
                    "acceptanceCriteria",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  )
                }
                className="min-h-[100px] font-mono text-sm"
              />
            </Field>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Priority">
                <select
                  value={story.priority}
                  onChange={(e) => update("priority", e.target.value as EtlStory["priority"])}
                  className="w-full rounded-md border border-white/10 bg-background/40 px-3 py-2 text-sm"
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </Field>
              <Field label="Estimate">
                <Input
                  value={story.estimate ?? ""}
                  onChange={(e) => update("estimate", e.target.value)}
                  placeholder="e.g. 5 pts"
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                size="lg"
                className="border border-white/15"
                style={{ background: "var(--gradient-agent)", boxShadow: "var(--shadow-glow)" }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Submitting…" : "Ship to Agent"}
              </Button>
            </div>
          </div>
        )}

        {run && <RunStatus key={run.run_id} initialRun={run} onClose={() => setRun(null)} />}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
