# Story intake landing (local Vite app)

Local **Cursor dev UI** for the same flow as the hosted [Lovable app](https://etl-spark-entry.lovable.app/#intake). Use this for day-to-day development; use Lovable when you need a public/ngrok demo URL.

**GitHub:** [MamtaVenugopal/etl-spark-entry](https://github.com/MamtaVenugopal/etl-spark-entry) — `landing/` on `main` (commit includes intake + run tracker + Agent 4 delivery UI).

---

## Routes

| URL | Page |
|-----|------|
| `/intake` | Hero + free-text story → **Refine with AI** → structured editor |
| `/runs/:runId` | Pipeline status + **Agent 4 delivery** (table, chart, YData iframe, PDF downloads) |

**Ship to Agent** opens `/runs/{runId}` in a **new tab**; intake stays on `/intake`.

Example run page:

`http://localhost:5173/runs/9489e58a-e7d5-48e6-9945-e758ae6fba3f`

(Vite may use **5174** if 5173 is busy — check the terminal line `Local: http://localhost:517x/`.)

---

## Setup

```bash
cd etl-spark-entry/landing
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173/intake` (or the port Vite prints).

**Important:** Vite reads `.env` only at startup. After editing `.env`, stop and run `npm run dev` again.

### Backend (required)

```bash
cd autonomous-etl-agent
docker compose up -d redis api worker
curl http://localhost:8000/health
```

---

## Environment

| Variable | Example |
|----------|---------|
| `VITE_API_BASE_URL` | `http://localhost:8000` (local) or ngrok URL (demo) |

If `landing/.env` is missing, dev mode defaults to `http://localhost:8000`.

### CORS (backend `.env`)

```env
ALLOWED_ORIGINS=...,http://localhost:5173,http://localhost:5174
```

After changing `.env` in `autonomous-etl-agent`:

```bash
docker compose up -d api --force-recreate
```

---

## API calls (from this app)

| Call | Purpose |
|------|---------|
| `POST /stories/refine` | Raw text → structured story (editable fields) |
| `POST /stories` | YAML body → Jira + `run_id` |
| `GET /runs/{run_id}` | Poll status, evaluations, `result_preview` |
| `GET /runs/{run_id}/report.pdf` | Final delivery PDF |
| `GET /runs/{run_id}/profile.html` | YData profile (graphs & stats; regenerated from S3 gold if stale) |

---

## Run page — Agent 4 · Delivery

When execute/delivery completes, `/runs/:id` shows:

- **Profiling / Unit tests / PR** status badges
- **Business results table** — sample rows from `result_preview`
- **Bar chart** — auto-built from label + numeric columns (e.g. `payment_type` vs `average_installments`)
- **YData profile iframe** — embedded HTML from Agent 4
- **Download links** — delivery PDF and profile (new tab)

---

## Lovable vs local landing

| | **Local `landing/`** (this app) | **Lovable hosted** |
|--|--------------------------------|---------------------|
| URL | `localhost:5173` or `5174` | [etl-spark-entry.lovable.app](https://etl-spark-entry.lovable.app/#intake) |
| Code | [landing/src/](src/) in this repo | Lovable project (legacy `src/components/landing/`) |
| Refine API | `POST /stories/refine` | Same backend |
| Run page | Dedicated `/runs/:id` route | Often single-page `#intake` + modal |

Both UIs talk to the same **autonomous-etl-agent** API on port **8000** (or ngrok).

---

## Project layout

```text
landing/
├── src/pages/IntakePage.tsx      # /intake
├── src/pages/RunPage.tsx         # /runs/:runId
├── src/components/
│   ├── StoryIntakeForm.tsx       # refine + ship
│   ├── RunTracker.tsx            # pipeline + gates
│   └── DeliveryResults.tsx       # Agent 4 table, chart, YData, downloads
└── src/lib/api.ts                # API_BASE, fetchRun, refine, submit
```
