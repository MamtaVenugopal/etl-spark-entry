# Story intake landing (local Vite app)

Standalone UI matching the [Lovable intake flow](https://etl-spark-entry.lovable.app/#intake): free-text story → AI refine → structured editor → **Ship to Agent** → dedicated run page.

## Routes

| URL | Page |
|-----|------|
| `/intake` | Hero + raw story + Refine with AI + structured editor |
| `/runs/:runId` | Pipeline status (polls `GET /runs/{id}` every 3s) |

## Setup

```bash
cd etl-spark-entry/landing
cp .env.example .env    # required for ngrok; optional for localhost (dev defaults to :8000)
npm install
npm run dev
```

Open http://localhost:5173/intake

**Important:** Vite reads `.env` only at startup. After creating or editing `.env`, stop and run `npm run dev` again.

**Backend must be running** before Refine works:

```bash
cd autonomous-etl-agent
docker compose up -d redis api worker
curl http://localhost:8000/health
```

## Environment

| Variable | Example |
|----------|---------|
| `VITE_API_BASE_URL` | `http://localhost:8000` or your ngrok URL |

Backend must be running (`docker compose up` in `autonomous-etl-agent`).

## API calls

1. `POST /stories/refine` — `{ "raw": "..." }` → structured story
2. `POST /stories` — YAML body (converted client-side via `storyToYaml.ts`); creates Jira + run
3. `GET /runs/{run_id}` — poll on run page

## CORS

Ensure `ALLOWED_ORIGINS` in the agent `.env` includes `http://localhost:5173`.
