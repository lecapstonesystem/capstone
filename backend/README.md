# UCMS Analytics Backend

FastAPI layer over `../scripts/ucms_analytics.py` — the paper's
**Data Analytics & Forecasting** module as an HTTP service.

CRUD stays direct Supabase-from-frontend (RLS-gated). This service does
the compute browsers must not do: forecasts, risk scoring, report files.

## Run

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
uvicorn main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/dashboard` | KPI block (capital share, released, borrowers, statuses) |
| POST | `/eligibility` | loan eligibility check against available ledger data |
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
| GET | `/analytics/backtest?holdout=6` | compares monthly forecast methods against unseen history |
| GET | `/analytics/forecast?months=6&holdout=6` | best-model release forecast and uncertainty band |
| GET | `/analytics/seasonality` | application seasonality and payday comparisons |
| GET | `/analytics/members/cycles?min_loans=2` | repeat-borrowing intervals |
| GET | `/analytics/members/propensity?top=20&horizon_days=90` | ranked repeat-application likelihood |
| GET | `/analytics/reliability` | repayment completion by loan term |
| GET | `/analytics/collections?months=6` | scheduled vs probability-weighted collections |
| GET | `/analytics/insights?holdout=6` | plain-language findings |
| GET | `/charts/{heatmap\|forecast\|backtest\|cycles}.png` | Analytics Lab charts |
| GET | `/portal/members` | MembersView-shaped rows (memberNo, names, status, dates) |
| GET | `/portal/loans?status=&loan_type=` | LoansView-shaped rows (payments, balance, delinquent flag) |
| GET | `/portal/dashboard` | 4 cards + attention items + recent activity (DashboardView) |
| GET | `/portal/applications` | ApplicationsView-shaped rows (empty until filed) |

Protected endpoints require a valid Supabase access token for a linked,
enabled admin account (`Authorization: Bearer <access-token>`). The Supabase
`service_role` key is used only by the backend and is never accepted as a
client credential.

The Loans module applies the cooperative's type-specific amount ranges,
capital-share limits, reloan threshold, co-maker rules, and term-based Vehicle
rates. Run `database/31_loan_policy_controls.sql` after the prior database
migrations to add the Board-member flag and enforce Super Admin-only loan
decisions in the database. Payslip and take-home-pay checks remain in-person.

## Data source: Supabase-first, CSV fallback

`store.py` (`load_all()`) tries live Supabase rows when `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` are set, else falls back to `data/*.csv`.
Frames keep CSV shapes, so every endpoint works unchanged on either
source. The active source prints on each load — check server logs.

The Analytics Lab's v2 endpoints use the full historical ledger loaded by
`ucms_analytics.py` from `UCMS_DATA_DIR` (CSV files), so their `records up to`
date is the source-data date, not necessarily today's Supabase data.

Seed the cloud once from the sample (idempotent, skips Unknown members,
dateless loans, and schedule-only rows):

```bash
cd scripts
../backend/.venv/bin/python seed_supabase.py --dry-run   # offline plan, no creds
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  ../backend/.venv/bin/python seed_supabase.py --apply
```

## Web Analytics Lab

Set `VITE_API_URL` in `web/.env` to the backend URL (for local development,
`http://localhost:8000`). The browser sends the signed-in Supabase session
automatically. The backend validates that token and confirms the account is a
linked, enabled admin. Do not configure an API key in the frontend; `VITE_*`
values are public browser code.
