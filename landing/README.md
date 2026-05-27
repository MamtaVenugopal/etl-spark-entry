# Story intake landing (local Vite app)

Local **Cursor dev UI** for story intake + run tracking.

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

## Landing → API

The landing app talks to the **autonomous-etl-agent** API on port **8000** (or a public/ngrok URL).

---

## Deploy for clients (Vercel + public API)

Give external clients a stable URL like `https://your-app.vercel.app/intake`.

**Architecture:**

```text
Client browser
    → Vercel (landing SPA)     https://your-app.vercel.app
    → Public API (FastAPI)     https://your-api.up.railway.app
         ├── Redis (queue)
         └── Worker (4-agent pipeline)
```

You need **two** public endpoints: the **frontend** (Vercel) and the **backend** (Railway/Render/AWS). The frontend calls the backend via `VITE_API_BASE_URL`.

### Step 1 — Deploy the landing app to Vercel

1. Push `landing/` to GitHub ([etl-spark-entry](https://github.com/MamtaVenugopal/etl-spark-entry)).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import `etl-spark-entry`.
3. **Root Directory:** set to `landing` (not repo root).
4. **Framework Preset:** Vite (auto-detected).
5. **Environment variable** (add before first deploy):

   | Name | Value (placeholder — update after Step 2) |
   |------|-------------------------------------------|
   | `VITE_API_BASE_URL` | `https://YOUR-API-URL` (no trailing slash) |

6. Deploy. Vercel builds `npm run build` and serves `dist/`.
7. Note your URL, e.g. `https://etl-story-intake.vercel.app`.

`vercel.json` in this folder enables React Router (`/intake`, `/runs/:id`) on refresh.

**CLI alternative:**

```bash
cd etl-spark-entry/landing
npm i -g vercel
vercel login
vercel --prod
# When prompted, set root to landing/ and add VITE_API_BASE_URL
```

### Step 2 — Deploy the API + worker (Railway)

Vercel hosts static files only. The FastAPI worker needs a server with **Redis + API + worker**.

**Option A — Railway (recommended for capstone)**

1. Go to [railway.app](https://railway.app) → **New Project**.
2. **Add Redis** (plugin) — copy `REDIS_URL`.
3. **Add service** → **Deploy from GitHub** → select `autonomous-etl-agent`.
4. Create **three services** from the same repo (or one Dockerfile + worker as second service):

   | Service | Start command |
   |---------|---------------|
   | **api** | `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT` |
   | **worker** | `python -m src.worker` |

   Railway sets `$PORT` automatically. Point both at the same Redis.

5. **Environment variables** on api + worker (copy from local `.env`):

   ```env
   REDIS_URL=redis://...   # from Railway Redis plugin
   AWS_REGION=us-west-1
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   S3_DATA_BUCKET=...
   GITHUB_TOKEN=...
   GITHUB_REPO=MamtaVenugopal/etl-spark-entry
   OPENAI_API_KEY=...      # or ANTHROPIC_API_KEY
   AUTO_GATE_1=true
   AUTO_GATE_2=true
   DATA_PLATFORM=aws
   ALLOWED_ORIGINS=https://your-app.vercel.app
   PUBLIC_API_BASE_URL=https://your-app.vercel.app
   ```

6. **Generate domain** for the api service → e.g. `https://autonomous-etl-agent-production.up.railway.app`.
7. Test: `curl https://YOUR-API-URL/health`

**Option B — Keep API on your Mac + ngrok (demo only)**

Not stable (URL changes). Use only for quick demos:

```bash
ngrok http 8000
```

Set `VITE_API_BASE_URL` on Vercel to the ngrok HTTPS URL.

### Step 3 — Wire frontend ↔ backend

1. In **Vercel** → Project → Settings → Environment Variables:
   - `VITE_API_BASE_URL` = `https://YOUR-API-URL` (Railway domain)
2. **Redeploy** Vercel (env vars are baked in at build time).
3. In **Railway api service** `.env`:
   - `ALLOWED_ORIGINS` must include your Vercel URL exactly (no trailing slash).
   - `PUBLIC_API_BASE_URL` = your **Vercel** URL (client run links in Jira/email).

### ngrok note (demo only)

If your public API is an **ngrok** URL, the hosted landing app cannot rely on direct `<iframe src=".../profile.html">` or `<a href=".../report.pdf">` links because ngrok’s interstitial requires a special header.

This landing app fetches artifacts with the `ngrok-skip-browser-warning` header via:

- `fetchProfileHtml(runId)` → embeds via `iframe srcDoc`
- `fetchArtifactBlob("/runs/{id}/report.pdf")` → downloads via blob

If you copy this UI to another repo/app, make sure you keep that behavior.

### Step 4 — Smoke test end-to-end

1. Open `https://your-app.vercel.app/intake`
2. Confirm no “Cannot reach API” banner (health check passes).
3. Submit a test story → **Ship to Agent**
4. New tab opens `/runs/{runId}` — status should poll every few seconds.
5. When complete, verify PDF download and business results table.

### Step 5 — Send to a client

Share only:

```text
Story intake:  https://your-app.vercel.app/intake
Run tracker:   https://your-app.vercel.app/runs/{runId}   (after they submit)
```

They do not need AWS, Docker, or GitHub access.

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Cannot reach API” | Wrong `VITE_API_BASE_URL`; redeploy Vercel after fixing |
| CORS error in browser console | Add exact Vercel origin to backend `ALLOWED_ORIGINS`; restart api |
| `/runs/xxx` 404 on refresh | Ensure `vercel.json` rewrites are deployed |
| Story stuck QUEUED | Worker not running or Redis URL wrong on worker service |
| ngrok “browser warning” | UI already sends `ngrok-skip-browser-warning`; use Railway for production |

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
