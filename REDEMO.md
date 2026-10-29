# REDEMO prep — Analytics Pack v2 (what to say, where to click)

Live URL: https://ucms-defense.pages.dev → Reports → **Analytics Lab** section
API: https://capstone-fipk.onrender.com (Swagger at /docs)
Register (live): 147 loans / 91 members · ledger as of 2025-10-22 · 34 modelled months

**Analytics now read the LIVE register** (Supabase) — anything entered on the
website flows into trends, forecasts, seasonality and member cycles with no
re-upload. Repayment schedule + completion marks stay on the paper-record
CSVs (the DB stores only payments actually received). Each payload reports
`n_loans_analyzed` (145 = 147 minus 2 pre-2023 strays) + caveats.

## The four questions the panel asked → where each lives

### (1) "When does each member actively apply (and pay)?"
- **UI:** Analytics Lab → *Member borrowing rhythm* table + cycles chart
- **API:** `/analytics/members/cycles`
- **Say:** "For the 29 members with 2+ loans we measure each member's own
  cycle — e.g. members return every ~9.4 months on average — their busy
  month, and a predicted next window (last loan + their cycle ± its
  variability). Single-loan members are flagged low-confidence and given
  the cohort average; we never invent a personal rhythm."
- **If asked about repayment:** completion marks per member join the same
  table (fully-paid share). The paper record has only 17 dated peso
  payments, so we report completion from the coop's marks, not fabricated
  punctuality.

### (2) "Which months do members apply (and repay)?"
- **UI:** hoverable heatmap (year × month, hover/tap shows loans + pesos)
  + the seasonality line at the Lab's bottom
- **API:** `/analytics/seasonality` (payload now includes `matrix`),
  printable chart `/charts/heatmap.png`
- **Say:** "Month-of-year indices from the 2023+ era: applications peak in
  **May**, trough in **December**. We also tested the paydays-15/30
  effect — lift 0.80× means *fewer* loans around paydays than a random
  baseline, an honest finding, not the expected one. Repayment seasonality
  comes from scheduled due dates (complete on paper), labelled as
  scheduled, not verified."

### (3) "How much money will be released in total?"
- **UI:** hoverable forecast chart + the three headline cards (total /
  interval / type split)
- **API:** `/analytics/forecast`
- **Say:** "The headline number is NOT a moving average we liked — it's the
  winner of a walk-forward backtest. The 6-month average beat the 3-month
  average, trend and seasonal-naive at ~53% weighted error, so it drives
  the forecast: ~₱207k/month, **~₱1.24M over six months**, with an
  *empirical* 95% interval of ±₱237k — measured from real backtest misses,
  not a formula."

### (4 implicit) "How do you know your models work?"
- **UI:** *Model scorecard* table + backtest chart (hover to compare
  guess vs reality month by month, with the difference shown)
- **API:** `/analytics/backtest`
- **Say:** "Every model is scored against months it was never shown. We
  report weighted error because the series has real zero months where MAPE
  explodes. Winner drives the forecast; the scorecard stays visible so the
  choice is auditable."

## Extra talking points (pick 2-3)
- **Collections honesty:** naive schedule promises ₱219.8k next 6 months;
  probability-weighted by term-bucket completion (short 98.3%, medium
  95.7%, long 92.7%) it's ₱203.7k — the ₱16k gap is overpromise avoided.
- **Auto-insights:** the system writes its own findings — Jan 2025 hit
  ₱510k (about 3.1× the normal ups and downs); 2025 is on pace for
  ₱2.92M (+117% vs 2024); 37% of members repeat-borrow.
- **Propensity call-list:** transparent weights (recency 35/frequency
  25/completion 20/punctuality 15/ticket 5) — every weight visible in the
  payload; no black box on 147 rows.
- **Interactive charts:** hover any point for exact amounts; the heatmap
  responds to hover AND tap (works on the panel's phones).
- **Time-travel rule:** the ledger ends Oct 2025, so predictions anchor at
  the ledger's as-of edge — a rhythm measured on data through 2025 cannot
  honestly "predict" 2026. Negative days-until = already due = call-list.
- **No duplicate transactions:** double-submitting an application
  (same member + amount + term, same day, still pending) returns the
  FIRST application's id — the API is idempotent, one click or five files
  one application.

## Backend restart / rebuild (if Render is asleep)
Render free tier sleeps after ~15 min idle — first call wakes it (~50s).
Open https://capstone-fipk.onrender.com/health once in the morning
(401 = awake and gated; that's FINE). The site shows fallback data until
the API wakes — nothing breaks.

## If anything backend-side looks wrong
1. Render dashboard → service `capstone` → Logs → search `data source`
   (`supabase (147 loans)` = healthy; `csv fallback` = env vars issue)
2. Environment tab must contain EXACTLY:
   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / UCMS_API_KEY
   (+ optional UCMS_CORS_ORIGINS — the code now defaults correctly)
3. After any env edit: Manual Deploy → Clear build cache & deploy
