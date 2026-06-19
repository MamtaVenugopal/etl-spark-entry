# Story intake landing (Vite SPA)

Local and Vercel-hosted UI for the Autonomous ETL Agent capstone.

| Route | Page |
|-------|------|
| `/intake` | Free-text story → Refine with AI → Ship to Agent |
| `/runs/:runId` | Pipeline progress, gold preview, charts, PDF |

**Live:** [etl-spark-entry-qutk.vercel.app/intake](https://etl-spark-entry-qutk.vercel.app/intake)

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Set `VITE_API_BASE_URL` to your FastAPI backend:

- Local: `http://localhost:8000`
- Public demo: your ngrok HTTPS URL (backend must be running)

Restart `npm run dev` after changing `.env`.

## Backend

Run from sibling repo [`autonomous-etl-agent`](https://github.com/MamtaVenugopal/autonomous-etl-agent):

```bash
docker compose up -d redis api worker
```

## Vercel deploy

1. Set project root to `landing/`
2. Env: `VITE_API_BASE_URL=https://YOUR-PUBLIC-API`
3. Redeploy after env changes

Add your Vercel origin to backend `ALLOWED_ORIGINS`.
