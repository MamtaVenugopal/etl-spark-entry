import type { EtlStory } from "./etl-story.schema";

function adfFromStory(story: EtlStory) {
  const para = (text: string) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
  const heading = (text: string) => ({
    type: "heading",
    attrs: { level: 3 },
    content: [{ type: "text", text }],
  });
  const bullets = (items: string[]) => ({
    type: "bulletList",
    content: items.map((t) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
    })),
  });

  return {
    type: "doc",
    version: 1,
    content: [
      heading("User Story"),
      para(`As a ${story.asA}, I want ${story.iWant}, so that ${story.soThat}.`),
      heading("Source → Target"),
      para(`${story.source}  →  ${story.target}`),
      heading("Transformations"),
      bullets(story.transformations),
      heading("Acceptance Criteria"),
      bullets(story.acceptanceCriteria),
      heading("Meta"),
      para(`Priority: ${story.priority}  •  Estimate: ${story.estimate ?? "TBD"}`),
      para("Submitted via Autonomous ETL Agent intake."),
    ],
  };
}

export async function createJiraIssue(story: EtlStory): Promise<{ key: string; url: string }> {
  const baseUrl = (process.env.JIRA_BASE_URL || "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) throw new Error("Jira credentials not configured.");

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const projectKey = "AEA";

  const tryCreate = async (issueTypeName: string) => {
    const body = {
      fields: {
        project: { key: projectKey },
        summary: story.title.slice(0, 240),
        description: adfFromStory(story),
        issuetype: { name: issueTypeName },
        labels: ["etl-agent", "auto-intake"],
      },
    };
    return fetch(`${baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    });
  };

  let res = await tryCreate("Task");
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    // Fallback to Story
    res = await tryCreate("Story");
  }
  if (!res.ok) {
    const txt = await res.text();
    console.error("Jira create failed", res.status, txt);
    throw new Error(`Jira create failed (${res.status})`);
  }
  const json = (await res.json()) as { key: string };
  return { key: json.key, url: `${baseUrl}/browse/${json.key}` };
}
