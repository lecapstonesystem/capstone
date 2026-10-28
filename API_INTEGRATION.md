# UCMS Analytics API — frontend integration guide

For: anyone wiring a frontend (admin portal or member app) to the Python engine.

## Where the API lives

| | URL |
|---|---|
| Live API (cloud, always deployable) | `https://capstone-fipk.onrender.com` |
| Interactive docs (click-around + try it) | `https://capstone-fipk.onrender.com/docs` |
| Health check | `https://capstone-fipk.onrender.com/health` (no key needed) |

Render free tier **sleeps after ~15 min idle** — the first call after idle takes
~50 s to wake it, then it's fast. Frontends must treat a failed/slow call as
"backend not ready" and fall back to their own numbers (see pattern below).

## Authentication

Every route except `/health`, `/docs`, `/openapi.json` needs the key:

```
X-API-Key: <ask the team lead — it is in Render ▸ Environment ▸ UCMS_API_KEY>
```

- `fetch` calls: send the header (see snippet below).
- `<img>` tags cannot send headers → append `?key=<KEY>` to chart URLs instead.
- **Never commit the key.** It goes in `.env` (gitignored) only.

## CORS (browsers only — curl/postman never hit this)

The API allows exactly these origins by default:
`http://localhost:5173` (Vite dev) and `https://ucms-defense.pages.dev`.

If you deploy your frontend **anywhere else**, its full origin (e.g.
`https://your-site.pages.dev`) must be added to `UCMS_CORS_ORIGINS` on Render
(comma-separated) + Manual Deploy — otherwise every browser call is blocked at
preflight with a 400 "Disallowed CORS origin" while curl keeps working.

## Endpoint map (all prefixed by the base URL above)

| Method | Path | What it gives you |
|---|---|---|
| GET | `/portal/dashboard` | KPI cards: members, active loans, outstanding, delinquent |
| GET | `/portal/members` | Members with balances + delinquency flags |
| GET | `/portal/loans?status=&loan_type=` | Loans with derived status/balance |
| GET | `/portal/applications` | Application queue rows |
| POST | `/eligibility` | Can member X borrow ₱Y over Z months? |
| POST | `/applications` | Submit an application |
| POST | `/applications/{id}/review` | Approve / reject |
| GET | `/risk/{member}` | One member's risk score + reasons |
| GET | `/forecast/disbursements?months=6` | v1 monthly disbursement forecast (MA3/MA6/trend) |
| GET | `/forecast/collections?months=6` | v1 expected collections from schedules |
| GET | `/analytics/backtest?holdout=6` | Accuracy test: 4 methods scored on hidden months |
| GET | `/analytics/forecast?months=6` | **v2 forecast: total ₱ + realistic range + type split** |
| GET | `/analytics/seasonality` | Month-of-year indices + payday effect |
| GET | `/analytics/members/cycles` | Per-member rhythm + expected next application |
| GET | `/analytics/members/propensity?top=20` | Who will most likely apply again (0–100) |
| GET | `/analytics/reliability` | Repayment record by loan length |
| GET | `/analytics/collections?months=6` | v2: says-due vs actually-expected |
| GET | `/analytics/insights` | Machine-generated plain-English findings |
| GET | `/charts/{kind}.png?key=` | PNG charts: `heatmap`, `forecast`, `backtest`, `cycles` |
| GET | `/report` | Excel workbook download |

Machine keys in payloads: forecast models are `ma3` / `ma6` / `trend` /
`seasonal_naive`; tags in insights are `unusual` / `model` / `behavior` /
`trend` / `repayment` / `rhythm`. Map them to display words in YOUR frontend
(plain-language labels are a UI concern; the API stays machine-stable).

## The 20-line client + the fallback rule

```js
const base = import.meta.env.VITE_API_URL   // e.g. https://capstone-fipk.onrender.com
const key  = import.meta.env.VITE_API_KEY   // from team lead — never commit

async function apiCall(path) {
  const r = await fetch(base + path, { headers: { 'X-API-Key': key } })
  if (!r.ok) throw new Error(`${r.status} on ${path}`)
  return r.json()
}

// USE PATTERN: API-first with silent fallback — the UI can never break.
// Try the Python engine; if it's asleep/unreachable, use your own
// store-computed numbers and move on.
let kpis = storeComputedKpis
try {
  const live = await apiCall('/portal/dashboard')
  kpis = { ...kpis, ...live.cards, source: 'python-api' }
} catch (e) {
  console.info('[api] engine unreachable, using local numbers:', e.message)
}
```

Rules of thumb we used (and the panel liked):
1. **API-first, fallback-silent** — every fetch is in a try/catch; store
   numbers stay as the default until the API answers.
2. **Show the source** — a tiny badge ("served live by the analytics engine"
   vs nothing) tells the viewer which numbers are on screen. Honest > magic.
3. **Charts via `<img :src="base + '/charts/forecast.png?key=' + key">`** —
   zero charting libraries needed; the engine renders the PNGs.

## Running the engine locally (instead of Render)

```bash
git clone https://github.com/lecapstonesystem/capstone
cd capstone && git checkout defense-backend
cd backend
cp .env.example .env        # then fill in the real values (ask team lead)
pip install -r requirements.txt
uvicorn main:app --port 8000
# → http://127.0.0.1:8000/docs
```

## Do NOT commit

`.env` files, service-role keys, `UCMS_API_KEY`, `.venv/`, `__pycache__/`,
`node_modules/`. The repo is private but keys in git history live forever.
