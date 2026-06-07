import { useState } from "react";
import { CheckCircle2, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import {
  refineStory,
  submitStory,
  validateStory,
  apiConfigured,
  usingDefaultApiUrl,
  API_BASE,
} from "@/lib/api";
import { storyToYaml } from "@/lib/storyToYaml";
import type { StructuredStory, StoryPriority, StoryValidateResponse } from "@/lib/types";

const PLACEHOLDER = `e.g. We need order counts by seller city and product category from Olist bronze tables. Join orders, items, sellers, products, and category translation. Output gold table with seller_city, product_category_name_english, and order_count.`;

const BLOCK_SHIP_ON_VALIDATION_FAIL =
  import.meta.env.VITE_BLOCK_SHIP_ON_VALIDATION_FAIL !== "false";

type Props = {
  autoGates?: boolean;
};

export function StoryIntakeForm({ autoGates: _autoGates }: Props) {
  const [raw, setRaw] = useState("");
  const [story, setStory] = useState<StructuredStory | null>(null);
  const [refining, setRefining] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<StoryValidateResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runValidation(nextStory: StructuredStory) {
    setValidating(true);
    try {
      const result = await validateStory(nextStory);
      setValidation(result);
    } catch (e) {
      setValidation(null);
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function handleRefine() {
    if (raw.trim().length < 20) {
      setError("Please add at least 20 characters describing your story.");
      return;
    }
    setError(null);
    setValidation(null);
    setRefining(true);
    try {
      const refined = await refineStory(raw);
      setStory(refined);
      await runValidation(refined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refine story.";
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
        setError(
          `Cannot reach API at ${API_BASE}. Start the backend (docker compose up in autonomous-etl-agent) or fix VITE_API_BASE_URL in landing/.env and restart npm run dev.`,
        );
      } else {
        setError(msg);
      }
    } finally {
      setRefining(false);
    }
  }

  async function handleValidate() {
    if (!story) return;
    setError(null);
    await runValidation(story);
  }

  async function handleSubmit() {
    if (!story) return;
    if (!apiConfigured()) {
      setError("VITE_API_BASE_URL is not configured.");
      return;
    }
    if (BLOCK_SHIP_ON_VALIDATION_FAIL && validation && !validation.passed) {
      setError("Fix validation errors before shipping, or edit the story and click Validate story.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const storyId = `US-${Date.now()}`;
      const yaml = storyToYaml(story, storyId);
      const res = await submitStory(storyId, story.title, yaml);
      const runUrl = `${window.location.origin}/runs/${res.run_id}`;
      window.open(runUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof StructuredStory>(k: K, v: StructuredStory[K]) {
    setValidation(null);
    setStory((s) => (s ? { ...s, [k]: v } : s));
  }

  return (
    <section id="intake" className="container mx-auto px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight">
            Tell the agent your <span className="text-gradient-agent">user story</span>
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Free-text in. Structured story out. Ship to Agent opens the run tracker in a new tab — intake stays here.
          </p>
        </div>

        {!apiConfigured() && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            API URL not set. Create <code className="font-mono">landing/.env</code> with{" "}
            <code className="font-mono">VITE_API_BASE_URL=http://localhost:8000</code> and restart{" "}
            <code className="font-mono">npm run dev</code>. Also ensure the backend is running:{" "}
            <code className="font-mono">docker compose up</code> in autonomous-etl-agent.
          </div>
        )}

        {usingDefaultApiUrl && apiConfigured() && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Using default API <code className="font-mono">{API_BASE}</code> (no{" "}
            <code className="font-mono">landing/.env</code>). For ngrok, set{" "}
            <code className="font-mono">VITE_API_BASE_URL</code> and restart the dev server.
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur p-6 md:p-8 card-glow">
          <label htmlFor="raw" className="font-mono text-xs tracking-widest text-agent-cyan">
            RAW STORY
          </label>
          <textarea
            id="raw"
            value={raw}
            onChange={(e) => setRaw(e.target.value.slice(0, 4000))}
            placeholder={PLACEHOLDER}
            className="mt-2 w-full min-h-[160px] rounded-lg border border-white/10 bg-background/40 p-3 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-agent-cyan"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">{raw.length}/4000</span>
            <button
              type="button"
              onClick={handleRefine}
              disabled={refining || !apiConfigured()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium btn-primary disabled:opacity-50"
            >
              {refining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {refining ? "Refining…" : "Refine with AI"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {story && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-card/40 backdrop-blur p-6 md:p-8 space-y-5">
            <p className="font-mono text-xs tracking-widest text-agent-cyan">
              STRUCTURED STORY · EDITABLE
            </p>

            <Field label="Title">
              <input
                value={story.title}
                onChange={(e) => update("title", e.target.value)}
                className="input-field"
              />
            </Field>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="As a">
                <input
                  value={story.asA}
                  onChange={(e) => update("asA", e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="I want">
                <input
                  value={story.iWant}
                  onChange={(e) => update("iWant", e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="So that">
                <input
                  value={story.soThat}
                  onChange={(e) => update("soThat", e.target.value)}
                  className="input-field"
                />
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Source">
                <input
                  value={story.source}
                  onChange={(e) => update("source", e.target.value)}
                  className="input-field"
                />
              </Field>
              <Field label="Target">
                <input
                  value={story.target}
                  onChange={(e) => update("target", e.target.value)}
                  className="input-field"
                />
              </Field>
            </div>
            <Field label="Transformations (one per line)">
              <textarea
                value={story.transformations.join("\n")}
                onChange={(e) =>
                  update(
                    "transformations",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  )
                }
                className="input-field min-h-[100px] font-mono"
              />
            </Field>
            <Field label="Acceptance Criteria (one per line)">
              <textarea
                value={story.acceptanceCriteria.join("\n")}
                onChange={(e) =>
                  update(
                    "acceptanceCriteria",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  )
                }
                className="input-field min-h-[100px] font-mono"
              />
            </Field>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Priority">
                <select
                  value={story.priority}
                  onChange={(e) => update("priority", e.target.value as StoryPriority)}
                  className="input-field"
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </Field>
              <Field label="Estimate">
                <input
                  value={story.estimate ?? ""}
                  onChange={(e) => update("estimate", e.target.value)}
                  placeholder="e.g. 5 pts"
                  className="input-field"
                />
              </Field>
            </div>

            {validation && (
              <div
                className={`rounded-lg border p-4 text-sm ${
                  validation.passed
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-100"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {validation.passed ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Story validation {validation.passed ? "passed" : "needs fixes"} (score{" "}
                  {validation.score.toFixed(2)})
                </div>
                {validation.summary && (
                  <p className="mt-2 text-xs opacity-90">{validation.summary}</p>
                )}
                <ul className="mt-3 space-y-1 text-xs font-mono">
                  {validation.checks
                    .filter((c) => !c.passed)
                    .map((c) => (
                      <li key={c.name}>
                        [{c.severity}] {c.message}
                      </li>
                    ))}
                </ul>
                {validation.suggested_fixes.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-xs">
                    {validation.suggested_fixes.map((fix) => (
                      <li key={fix}>{fix}</li>
                    ))}
                  </ul>
                )}
                {validation.generated_test_path && (
                  <p className="mt-2 text-xs opacity-75">
                    Generated tests: {validation.generated_test_path}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleValidate}
                disabled={validating || !apiConfigured()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium btn-primary disabled:opacity-50"
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {validating ? "Validating…" : "Validate story"}
              </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                submitting ||
                !apiConfigured() ||
                (BLOCK_SHIP_ON_VALIDATION_FAIL && validation !== null && !validation.passed)
              }
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3 text-sm font-medium btn-primary disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting ? "Submitting…" : "Ship to Agent"}
            </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
