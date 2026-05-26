import type {
  HealthResponse,
  RunState,
  StructuredStory,
  SubmitStoryResponse,
} from "./types";

/** Dev default avoids a dead UI when landing/.env is missing (restart dev server after creating .env). */
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  (import.meta.env.DEV ? "http://localhost:8000" : "")
);

export const usingDefaultApiUrl =
  !import.meta.env.VITE_API_BASE_URL && import.meta.env.DEV;

export const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

export function apiConfigured(): boolean {
  return Boolean(API_BASE);
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  if (!API_BASE) return null;
  const r = await fetch(`${API_BASE}/health`, { headers: JSON_HEADERS });
  if (!r.ok) return null;
  return (await r.json()) as HealthResponse;
}

export async function refineStory(raw: string): Promise<StructuredStory> {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL is not configured.");
  const r = await fetch(`${API_BASE}/stories/refine`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt.slice(0, 300) || `Refine failed (${r.status})`);
  }
  const data = (await r.json()) as { story: StructuredStory; error?: string };
  if (data.error) throw new Error(data.error);
  return data.story;
}

export async function submitStory(
  storyId: string,
  title: string,
  yamlContent: string,
): Promise<SubmitStoryResponse> {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL is not configured.");
  const r = await fetch(`${API_BASE}/stories`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      story_id: storyId,
      title,
      input_mode: "yaml",
      content: yamlContent,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt.slice(0, 300) || `Submit failed (${r.status})`);
  }
  return (await r.json()) as SubmitStoryResponse;
}

export async function fetchRun(runId: string): Promise<RunState> {
  if (!API_BASE) throw new Error("VITE_API_BASE_URL is not configured.");
  const r = await fetch(`${API_BASE}/runs/${runId}`, { headers: JSON_HEADERS });
  if (!r.ok) {
    throw new Error(`Run not found (${r.status})`);
  }
  return (await r.json()) as RunState;
}

export async function confirmRun(runId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/runs/${runId}/confirm`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}",
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function approveRun(runId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/runs/${runId}/approve`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}",
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function headArtifact(path: string): Promise<boolean> {
  if (!API_BASE) return false;
  try {
    const r = await fetch(`${API_BASE}${path}`, { method: "HEAD", headers: JSON_HEADERS });
    return r.ok;
  } catch {
    return false;
  }
}

export function artifactUrl(path: string): string {
  return `${API_BASE}${path}`;
}
