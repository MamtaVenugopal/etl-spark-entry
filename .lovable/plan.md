## Goal

Temporarily redirect the "Ship to Jira" submission to your webhook.site URL so you can inspect the exact JSON payload the app sends, without touching the UI or AI refinement flow.

## Target URL

`https://webhook.site/5a29ffd0-993a-4564-bd53-1b8838bb494b`

## Changes

**1. `src/lib/jira.server.ts` — add a webhook bypass**

At the top of `createJiraIssue`, check for an env flag `JIRA_WEBHOOK_OVERRIDE_URL`. When set:
- POST the full JSON body that would normally go to Jira (the ADF-formatted issue payload) to that URL instead.
- Also include the raw `EtlStory` object alongside, so you can see both shapes in one request.
- Return a fake `{ key: "WEBHOOK-TEST", url: "<webhook.site URL>" }` so the UI's success path still renders a clickable link.
- Skip Basic auth, skip the Task → Story fallback, skip Jira entirely.

When the env flag is absent, behavior is unchanged (real Jira call).

**2. Add the secret `JIRA_WEBHOOK_OVERRIDE_URL`**

Set its value to `https://webhook.site/5a29ffd0-993a-4564-bd53-1b8838bb494b`. To restore normal Jira posting later, just delete the secret — no code change required.

## What you'll see on webhook.site

A single POST with JSON body shaped like:

```text
{
  "story": { ...EtlStory fields... },
  "jiraPayload": { "fields": { "project": {"key":"AEA"}, "summary": "...", "description": {ADF}, ... } }
}
```

## Files touched

- `src/lib/jira.server.ts` (small bypass block at top of `createJiraIssue`)
- New secret: `JIRA_WEBHOOK_OVERRIDE_URL`

No UI, schema, or AI changes.
