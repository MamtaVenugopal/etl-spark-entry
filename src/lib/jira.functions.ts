import { createServerFn } from "@tanstack/react-start";
import { EtlStorySchema, type EtlStory } from "./etl-story.schema";
import { createJiraIssue } from "./jira.server";

// Simple in-memory rate limit (per server instance)
const submissions: number[] = [];
const WINDOW_MS = 60 * 60 * 1000;
const MAX = 30;

export const submitToJira = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => EtlStorySchema.parse(input))
  .handler(async ({ data }): Promise<{ key: string | null; url: string | null; error: string | null }> => {
    const now = Date.now();
    while (submissions.length && now - submissions[0] > WINDOW_MS) submissions.shift();
    if (submissions.length >= MAX) {
      return { key: null, url: null, error: "Rate limit reached. Try again later." };
    }
    submissions.push(now);

    try {
      const result = await createJiraIssue(data as EtlStory);
      return { key: result.key, url: result.url, error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { key: null, url: null, error: msg };
    }
  });
