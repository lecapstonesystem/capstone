# UCMS Analytics Backend

FastAPI layer over `../scripts/ucms_analytics.py` — the paper's
**Data Analytics & Forecasting** module as an HTTP service.

CRUD stays direct Supabase-from-frontend (RLS-gated). This service does
the compute browsers must not do: forecasts, risk scoring, report files.

## Run

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then fill UCMS_API_KEY
uvicorn main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/dashboard` | KPI block (capital share, released, borrowers, statuses) |
| POST | `/eligibility` | coop rules check (2x share, 2-loan max, emergency cap) |
| POST | `/applications` | file a PENDING application |
| POST | `/applications/{id}/review` | approve / reject (guarded transitions) |
| GET | `/forecast/disbursements?months=6` | MA + trend forecast |
| GET | `/forecast/collections?months=6` | expected cash-in from schedules |
| GET | `/risk/{member}` | rule score + 6-month delinquency flag |
| POST | `/report` | downloads the multi-sheet Excel report |
| POST | `/receipt/verify` | OCR-field check vs expected amount |
| GET | `/risk/delinquent?limit=20` | riskiest members first (Dashboard card + Reports table) |
| GET | `/reports/summary` | one-pager JSON (released, disbursed, collected, delinquent, by-type) |
| GET | `/analytics/by-term` | loans + pesos per term selection (forecast charts) |
| GET | `/portal/members` | MembersView-shaped rows (memberNo, names, status, dates) |
| GET | `/portal/loans?status=&loan_type=` | LoansView-shaped rows (payments, balance, delinquent flag) |
| GET | `/portal/dashboard` | 4 cards + attention items + recent activity (DashboardView) |
| GET | `/portal/applications` | ApplicationsView-shaped rows (empty until filed) |

All (except docs page) require header `X-API-Key: <UCMS_API_KEY>`
when the env var is set. `service_role` is never accepted here as a
substitute and never leaves the server.
