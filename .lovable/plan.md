## Autonomous ETL Agent — Story Intake Landing Page

A bold, AI-agent themed landing page where DevOps/data folks describe an ETL need in plain English. An AI assistant rewrites it into a proper user story with structured ETL metadata, then files it as a ticket in your Jira project **AEA** at `mamtavenugopal.atlassian.net`.

---

### UX design (before code)

**Layout (single page, top → bottom)**

```
┌──────────────────────────────────────────────────────┐
│  NAV: ⚡ Autonomous ETL Agent     [Docs] [Submit →] │
├──────────────────────────────────────────────────────┤
│                                                      │
│        ✦ Animated gradient orb / glow ✦             │
│                                                      │
│   Ship ETL pipelines from a sentence.                │
│   Describe the job. The agent writes the code,       │
│   tests it, and opens the PR.                        │
│                                                      │
│       [ Describe your pipeline ↓ ]                   │
│                                                      │
├──────────────────────────────────────────────────────┤
│  HOW IT WORKS  (4 steps with animated connectors)    │
│  ① Story → ② Code → ③ Tests → ④ PR + Deploy         │
├──────────────────────────────────────────────────────┤
│  STORY INTAKE (the main event)                       │
│                                                      │
│   ┌────────────────────────────────────────────┐    │
│   │  Free-text box (large, glowing border)     │    │
│   │  "e.g. Every morning, clean nulls from     │    │
│   │   raw orders, join with customers, and     │    │
│   │   aggregate monthly revenue by region."    │    │
│   └────────────────────────────────────────────┘    │
│                                                      │
│   [ ✨ Refine with AI ]   [ Submit to Jira → ]      │
│                                                      │
│   ── After AI refine, a preview card appears: ──    │
│   ┌────────────────────────────────────────────┐    │
│   │  Title:  Monthly revenue rollup by region  │    │
│   │  As a … I want … so that …                 │    │
│   │  Sources:  raw_orders, customers           │    │
│   │  Target:   analytics.monthly_revenue       │    │
│   │  Ops:      clean-nulls, join, aggregate    │    │
│   │  Acceptance criteria: • … • … • …          │    │
│   │  Priority: Medium                          │    │
│   │  [Edit]                [Looks good, file]  │    │
│   └────────────────────────────────────────────┘    │
│                                                      │
│   On submit → toast: "AEA-123 created" + link       │
├──────────────────────────────────────────────────────┤
│  CAPABILITIES grid (6 cards: Parse · Generate ·     │
│  Optimize · Test · PR · Deploy)                     │
├──────────────────────────────────────────────────────┤
│  TECH STACK strip (Spark, Delta, LangGraph, Jira…)  │
├──────────────────────────────────────────────────────┤
│  FOOTER                                              │
└──────────────────────────────────────────────────────┘
```

**Visual direction — "Bold AI / agent"**
- Deep near-black background with animated radial gradients (violet → cyan → magenta).
- Glow / soft neon borders on the intake card and CTA.
- Subtle grid backdrop, a slowly pulsing "agent orb" in the hero.
- Mono accents (JetBrains Mono) for code-like hints; Inter for body.
- Micro-animations: typewriter placeholder in the textarea, shimmer on the "Refine with AI" button while thinking, step connectors that light up on scroll.
- Fully responsive; on mobile (current 683px viewport) the hero stacks and the orb shrinks.

**Interaction flow**
1. User lands → hero CTA scrolls to intake.
2. Types or pastes a rough description.
3. Clicks **Refine with AI** → loading shimmer → structured story preview appears below.
4. User can edit fields inline, then **File to Jira**.
5. Server creates an AEA issue → success toast with the issue key + direct link to the ticket.

---

### Jira connection (project AEA)

The URL you shared is the Service Desk *queue UI*, which is just a view of issues in project key **AEA** on `mamtavenugopal.atlassian.net`. We connect via Jira Cloud REST API v3:

`POST https://mamtavenugopal.atlassian.net/rest/api/3/issue` with Basic auth (`email:api_token` base64-encoded).

Three secrets required (added via the secrets tool, never in code):
- `JIRA_BASE_URL` = `https://mamtavenugopal.atlassian.net`
- `JIRA_EMAIL` = your Atlassian account email
- `JIRA_API_TOKEN` = token from `id.atlassian.com/manage-profile/security/api-tokens`

Issue payload:
```json
{
  "fields": {
    "project": { "key": "AEA" },
    "summary": "<refined title>",
    "issuetype": { "name": "Task" },
    "description": { /* ADF doc with the user story + ETL metadata */ },
    "labels": ["etl-agent", "auto-intake"]
  }
}
```
(If "Task" is not a valid issue type in AEA, we'll fall back to the project's default — the server function reads `/rest/api/3/issue/createmeta` once and caches the type.)

---

### Technical plan

**New files**
- `src/routes/index.tsx` — replace the placeholder with the full landing page composition.
- `src/components/landing/Hero.tsx` — animated hero + CTA.
- `src/components/landing/HowItWorks.tsx` — 4-step pipeline visual.
- `src/components/landing/StoryIntake.tsx` — textarea, AI refine button, structured preview, submit.
- `src/components/landing/Capabilities.tsx` — feature grid.
- `src/components/landing/StackStrip.tsx` — tech logos/labels.
- `src/components/landing/Footer.tsx`.
- `src/components/landing/AgentOrb.tsx` — pure CSS/SVG animated orb.
- `src/lib/etl-story.schema.ts` — Zod schema for the refined story.
- `src/lib/jira.functions.ts` — `createJiraIssue` server function (Zod-validated input, calls Jira REST, returns `{ key, url }` or typed error).
- `src/lib/jira.server.ts` — Jira REST helper + ADF builder.
- `src/lib/refine-story.functions.ts` — `refineEtlStory` server function: calls Lovable AI Gateway (`google/gemini-2.5-flash`) with a structured-output schema to convert free text → `EtlStory`.

**Styling**
- Extend `src/styles.css` with new tokens: `--agent-violet`, `--agent-cyan`, `--agent-magenta`, `--gradient-agent`, `--shadow-glow`, plus keyframes for `pulse-orb`, `shimmer`, `gradient-shift`. All colors in `oklch`. No raw color classes in components — only semantic tokens.

**SEO**
- Update `__root.tsx` head defaults and add per-page meta in `index.tsx`: title "Autonomous ETL Agent — Ship pipelines from a sentence" (<60 chars), description (<160 chars), og:title/description, single H1 in hero.

**Secrets to add (one prompt)**
`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, plus we'll rely on the existing `LOVABLE_API_KEY` for the AI refine call.

**Validation & security**
- Zod validates both the AI-refined story and the Jira submit payload server-side.
- Length caps on free-text input (4000 chars) and all refined fields.
- Errors from Jira are surfaced as friendly toasts; raw response bodies stay server-side.
- Basic in-memory rate limit (e.g., 10 submissions / IP / hour) on the submit server function.

**Out of scope for this iteration**
- No persistence of submissions (can add Lovable Cloud later if you want a history view).
- No auth on the page (anyone with the URL can file a ticket — fine for an internal tool; we can gate it later).
- No actual code-generation agent — this page is the *intake* surface; downstream agents live in your repo.
