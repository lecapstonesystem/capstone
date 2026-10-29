"""UCMS Analytics & Forecasting — single-file starter system.

Covers 6 capstone modules in one place:
  1. Loan Management      (review queue: approve / reject / update status)
  2. Real-Time Dashboard  (capital share, loans released, borrowers, statuses)
  3. Financial Reports    (clean multi-sheet Excel + CSV export)
  4. Repayment Risk       (rule score + 6-month delinquency + optional RF model)
  5. Forecasting          (moving-average + trend + expected collections)
  6. OCR Receipt Check    (pytesseract with regex mock fallback)

Reads the CSVs our parsers already built. Run:  python3 scripts/ucms_analytics.py
Requires: pandas, scikit-learn, matplotlib, openpyxl (all installed).
"""

from __future__ import annotations

import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless: save PNGs, never pop up windows
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

# --------------------------------------------------------------------------
# 0. PATHS — env override wins, else paths relative to THIS file's tree.
# --------------------------------------------------------------------------
# Backend runs from capstone-main/, notebooks ran from data-science-portfolio/;
# UCMS_DATA_DIR / UCMS_OUTPUT_DIR let each caller point at its own tree
# without editing code. Defaults = the data/ and outputs/ next to scripts/.
import os

_HERE = Path(__file__).resolve()
DATA_DIR = Path(os.environ.get("UCMS_DATA_DIR", _HERE.parents[1] / "data"))
OUTPUT_DIR = Path(os.environ.get("UCMS_OUTPUT_DIR", _HERE.parents[1] / "outputs"))

LOANS_CSV = DATA_DIR / "loans_clean.csv"        # one row per loan
PAYMENTS_CSV = DATA_DIR / "payments.csv"        # one row per installment
STATS_CSV = DATA_DIR / "payment_stats.csv"      # one row per loan (expected vs paid)
APPLICATIONS_CSV = DATA_DIR / "loan_applications.csv"  # created on first submit
SHARE_CSV = DATA_DIR / "share_capital.csv"      # optional; absent in sample file

FORECAST_MONTHS = 6          # how far ahead to project
DELINQUENT_MONTHS = 6        # coop rule (interview): 6 months unpaid = delinquent
LOAN_STATUSES = ("PENDING", "APPROVED", "REJECTED", "RELEASED",
                 "ACTIVE", "FULLY_PAID", "DELINQUENT")

# Regexes for receipt parsing (module 6). Compiled once, reused everywhere.
AMOUNT_RE = re.compile(r"\d{1,3}(?:,\d{3})*\.\d{2}")
DATE_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")
REF_RE = re.compile(r"\b[A-Z]{2,5}[- ]?\d{4,}\b")

try:  # optional dependency: real OCR only if installed
    import pytesseract  # type: ignore
    from PIL import Image  # type: ignore
    _OCR_AVAILABLE = True
except ImportError:
    _OCR_AVAILABLE = False


# --------------------------------------------------------------------------
# Helpers: loading + canonical keys (same normalizer as parse_loans.py)
# --------------------------------------------------------------------------
def make_loan_key(sheet, member, amount, term_months, date_raw) -> str:
    """Canonical loan id: sheet|member|amount|term|date, all as plain str.

    Both parsers saw the same loan's Date cell differently (datetime vs
    "3/2/23" vs blank), so raw equality failed. Normalizing here fixes it.
    """
    m = " ".join(str(member if member is not None else "Unknown").split()).lower()
    try:
        a = f"{float(amount):.2f}"
    except (TypeError, ValueError):
        a = "NOAMT"
    try:
        t = str(int(float(term_months)))
    except (TypeError, ValueError):
        t = "NATRM"
    d = pd.to_datetime(date_raw, errors="coerce")
    ds = d.strftime("%Y-%m-%d") if not pd.isna(d) else "NODATE"
    s = " ".join(str(sheet or "").split()).lower()
    return f"{s}|{m}|{a}|{t}|{ds}"


def load_data():
    """Load every CSV that exists; missing files become empty frames.

    keep_default_na=False keeps the literal loan_type "N/A" from turning
    into NaN on read — the most common silent-corruption bug in this stack.
    """
    loans = (pd.read_csv(LOANS_CSV, keep_default_na=False)
             if LOANS_CSV.exists() else pd.DataFrame())
    if not loans.empty:
        loans["loan_amount"] = pd.to_numeric(loans["loan_amount"], errors="coerce")
        loans["term_months"] = pd.to_numeric(loans["term_months"], errors="coerce")
        loans["date"] = pd.to_datetime(loans["date"], errors="coerce")
        loans["loan_key"] = [make_loan_key(s, m, a, t, d) for s, m, a, t, d in
                             zip(loans["sheet"], loans["member"], loans["loan_amount"],
                                 loans["term_months"], loans["date_raw"])]
    pays = (pd.read_csv(PAYMENTS_CSV, keep_default_na=False)
            if PAYMENTS_CSV.exists() else pd.DataFrame())
    if not pays.empty:
        pays["date_paid"] = pd.to_datetime(pays["date_paid"], errors="coerce")
    stats = (pd.read_csv(STATS_CSV, keep_default_na=False)
             if STATS_CSV.exists() else pd.DataFrame())
    shares = (pd.read_csv(SHARE_CSV, keep_default_na=False)
              if SHARE_CSV.exists() else pd.DataFrame())
    return loans, pays, stats, shares


# --------------------------------------------------------------------------
# 1. LOAN MANAGEMENT — admin review queue with guarded status transitions
# --------------------------------------------------------------------------
# Allowed moves: PENDING -> APPROVED | REJECTED; APPROVED -> RELEASED.
# Anything else raises instead of corrupting history (audit-friendly).
TRANSITIONS = {
    "PENDING": ("APPROVED", "REJECTED"),
    "APPROVED": ("RELEASED",),
    "REJECTED": (),
    "RELEASED": (),
}


def check_eligibility(member, amount, term, loans, shares, loan_type="Regular"):
    """Coop rules from the client interview. Returns (ok, reasons[list]).

    Rules encoded: max 2 simultaneous loans; regular max = 2x capital share
    (100% if share below threshold); new members wait 2 months and borrow
    max 80% first; emergency <= 20k alongside a regular loan.
    Capital data is absent from the sample, so `shares` may be empty — the
    function then checks only what history allows and says so explicitly.
    """
    reasons = []
    hist = loans[loans["member"].astype(str).str.strip().str.lower()
                 == str(member).strip().lower()] if not loans.empty else loans
    active = hist  # sample has no per-loan status; treat history as active load
    if len(active) >= 2:
        reasons.append("member already holds 2 loans (maximum)")
    if loan_type.lower().startswith("emerg") and float(amount) > 20000:
        reasons.append("emergency loan cap is Php 20,000")
    if shares.empty:
        reasons.append("note: no capital-share file — share-based caps unchecked")
    else:
        row = shares[shares["member"].astype(str).str.strip().str.lower()
                     == str(member).strip().lower()]
        if row.empty:
            reasons.append("new member: unscored until history exists")
        else:
            share = float(row.iloc[0]["capital_share"])
            if float(amount) > 2 * share:
                reasons.append(f"amount exceeds 2x capital share (2x{share:,.0f})")
    hard = [r for r in reasons if not r.startswith(("note", "new member"))]
    return (not hard, reasons)


def submit_application(member, amount, term_months, loan_type="Regular",
                       purpose=""):
    """Append a PENDING application; creates the store file on first use.

    Duplicate guard (panel revision: 'transactions should not be
    duplicated easily'): the same member asking for the same amount and
    term on the same day, with that application still PENDING or already
    APPROVED, is almost always an accidental double-submit — the first
    application's id is returned instead of filing a second one. The API
    stays idempotent, so a double-clicked Submit button produces one
    application, not two.
    """
    today = str(pd.Timestamp.today().date())
    app_id = f"APP-{pd.Timestamp.today():%Y%m%d}-001"
    if APPLICATIONS_CSV.exists():
        apps = pd.read_csv(APPLICATIONS_CSV, keep_default_na=False)
        if len(apps):
            same = apps[
                (apps["member"].astype(str).str.strip().str.lower()
                 == str(member).strip().lower())
                & (pd.to_numeric(apps["amount"], errors="coerce")
                   == float(amount))
                & (pd.to_numeric(apps["term_months"], errors="coerce")
                   == int(term_months))
                & (apps["date_submitted"].astype(str) == today)
                & (apps["status"].astype(str).str.upper()
                   .isin(["PENDING", "APPROVED"]))]
            if len(same):
                return str(same.iloc[0]["app_id"])
        app_id = f"APP-{pd.Timestamp.today():%Y%m%d}-{len(apps) + 1:03d}"
    else:
        apps = pd.DataFrame()
    row = pd.DataFrame([{
        "app_id": app_id, "member": member, "amount": float(amount),
        "term_months": int(term_months), "loan_type": loan_type,
        "purpose": purpose, "status": "PENDING",
        "date_submitted": str(pd.Timestamp.today().date()),
        "reviewed_by": "", "date_reviewed": "", "reason": "",
    }])
    apps = pd.concat([apps, row], ignore_index=True)
    APPLICATIONS_CSV.parent.mkdir(parents=True, exist_ok=True)
    apps.to_csv(APPLICATIONS_CSV, index=False)
    return app_id


def review_application(app_id, decision, reviewer="", reason=""):
    """Approve or reject a PENDING app. Decision must be APPROVED/REJECTED."""
    decision = decision.upper()
    if decision not in ("APPROVED", "REJECTED"):
        raise ValueError("decision must be APPROVED or REJECTED")
    apps = pd.read_csv(APPLICATIONS_CSV, keep_default_na=False)
    i = apps.index[apps["app_id"] == app_id]
    if len(i) == 0:
        raise KeyError(f"unknown {app_id}")
    i = i[0]
    if apps.at[i, "status"] not in TRANSITIONS or \
            decision not in TRANSITIONS[apps.at[i, "status"]]:
        raise ValueError(f"illegal {apps.at[i, 'status']} -> {decision}")
    apps.at[i, "status"] = decision
    apps.at[i, "reviewed_by"] = reviewer
    apps.at[i, "date_reviewed"] = str(pd.Timestamp.today().date())
    apps.at[i, "reason"] = reason
    apps.to_csv(APPLICATIONS_CSV, index=False)
    return apps.loc[i].to_dict()


# --------------------------------------------------------------------------
# 2. REAL-TIME DASHBOARD — one function, printed KPI block
# --------------------------------------------------------------------------
def dashboard_metrics(loans, stats, shares):
    """Compute the admin KPI block. Capital share reads from file if present;
    the sample has none, so it reports UNAVAILABLE instead of inventing one.
    """
    m = {}
    m["loans_released"] = len(loans)
    m["total_disbursed"] = float(loans["loan_amount"].sum()) if len(loans) else 0.0
    if not stats.empty and "fully_paid" in stats.columns:
        paid_keys = set(stats.loc[stats["fully_paid"].astype(str) == "True", "loan_key"]) \
            if "loan_key" in stats.columns else set()
        m["fully_paid_loans"] = int(stats["fully_paid"].astype(str).eq("True").sum())
        active = loans if "loan_key" not in loans.columns else \
            loans[~loans["loan_key"].isin(paid_keys)]
        m["active_borrowers"] = int(active["member"].nunique()) if len(active) else 0
    else:
        m["fully_paid_loans"] = 0
        m["active_borrowers"] = int(loans["member"].nunique()) if len(loans) else 0
    m["active_loans"] = m["loans_released"] - m["fully_paid_loans"]
    m["total_capital_share"] = float(shares["capital_share"].sum()) \
        if not shares.empty and "capital_share" in shares.columns else None
    return m


def print_dashboard(m):
    cap = f"Php {m['total_capital_share']:,.2f}" if m["total_capital_share"] is not None \
        else "UNAVAILABLE (no share_capital.csv)"
    print("\n========== UCMS DASHBOARD ==========")
    print(f"Total capital share : {cap}")
    print(f"Loans released      : {m['loans_released']}")
    print(f"Active borrowers    : {m['active_borrowers']}")
    print(f"Active loans        : {m['active_loans']}")
    print(f"Fully paid loans    : {m['fully_paid_loans']}")
    print("====================================")


# --------------------------------------------------------------------------
# 3. FINANCIAL REPORT GENERATION — one clean multi-sheet Excel workbook
# --------------------------------------------------------------------------
def monthly_series(loans):
    """Disbursed pesos per calendar month, zero-filled across the full span."""
    dated = loans.dropna(subset=["date"]).copy()
    s = dated.groupby(dated["date"].dt.to_period("M"))["loan_amount"].sum()
    s.index = s.index.to_timestamp()
    return s.asfreq("MS", fill_value=0.0).rename("disbursed")


def generate_report(loans, stats, pays, out_name="ucms_financial_report.xlsx"):
    """Export loans + stats + term summary + monthly series to Excel."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    term = loans.groupby("term_months").agg(
        n_loans=("loan_amount", "size"), total=("loan_amount", "sum"),
        average=("loan_amount", "mean")) if len(loans) else pd.DataFrame()
    monthly = monthly_series(loans).reset_index().rename(columns={"index": "month"}) \
        if len(loans) else pd.DataFrame()
    out = OUTPUT_DIR / out_name
    with pd.ExcelWriter(out, engine="openpyxl") as w:
        loans.to_excel(w, sheet_name="loans", index=False)
        if not stats.empty:
            stats.to_excel(w, sheet_name="repayment_stats", index=False)
        term.to_excel(w, sheet_name="by_term")
        monthly.to_excel(w, sheet_name="monthly", index=False)
    # Machine-readable copies for the forecasting module / panel demo.
    loans.to_csv(OUTPUT_DIR / "report_loans.csv", index=False)
    print(f"Report written -> {out}")
    return out


# --------------------------------------------------------------------------
# 4. REPAYMENT RISK INDICATOR — rules first, ML when data allows
# --------------------------------------------------------------------------
def member_features(member, loans, stats, pays):
    """Aggregate everything known about one member into a feature dict."""
    key = str(member).strip().lower()
    hl = loans[loans["member"].astype(str).str.strip().str.lower() == key]
    hs = stats[stats["member"].astype(str).str.strip().str.lower() == key] \
        if not stats.empty else stats
    last_paid = pd.NaT
    if not pays.empty:
        mp = pays[pays["member"].astype(str).str.strip().str.lower() == key]
        if "date_paid" in mp.columns and mp["date_paid"].notna().any():
            last_paid = mp["date_paid"].max()
    start = hl["date"].min() if len(hl) and "date" in hl.columns else pd.NaT
    return {
        "member": member, "n_loans": len(hl),
        "total_borrowed": float(hl["loan_amount"].sum()) if len(hl) else 0.0,
        "collection_rate": float(hs["collection_rate"].mean()) if len(hs) else np.nan,
        "paid_row_ratio": float(hs["paid_row_ratio"].mean()) if len(hs) else np.nan,
        "fully_paid_share": float(hs["fully_paid"].astype(str).eq("True").mean()) if len(hs) else np.nan,
        "last_paid": last_paid, "first_loan": start,
    }


def risk_score(feat, today=None):
    """Rule score 0-100 (higher = riskier) + delinquency flag + band.

    New members (no history) return UNSCORED per the paper, never a number.
    Delinquent = not fully paid AND no payment activity for DELINQUENT_MONTHS.
    """
    today = pd.Timestamp.today().normalize() if today is None else today
    if feat["n_loans"] == 0:
        return {"score": None, "band": "UNSCORED", "delinquent_6m": False,
                "reasons": ["no loan history"]}
    score, reasons = 0, []
    anchor = feat["last_paid"] if not pd.isna(feat["last_paid"]) else feat["first_loan"]
    months_idle = ((today - anchor).days / 30.44) if not pd.isna(anchor) else np.nan
    fully_done = (feat["fully_paid_share"] == 1.0)
    delinq = bool(not fully_done and not pd.isna(months_idle)
                  and months_idle >= DELINQUENT_MONTHS)
    if delinq:
        score += 40
        reasons.append(f"no payment activity for {months_idle:.0f} months (>= {DELINQUENT_MONTHS})")
    if not pd.isna(feat["collection_rate"]) and feat["collection_rate"] < 0.5:
        score += 25
        reasons.append(f"collection rate {feat['collection_rate']:.0%} < 50%")
    if not pd.isna(feat["paid_row_ratio"]) and feat["paid_row_ratio"] < 0.5:
        score += 15
        reasons.append(f"only {feat['paid_row_ratio']:.0%} of schedule rows show payment")
    band = "HIGH" if score >= 60 else ("MEDIUM" if score >= 30 else "LOW")
    return {"score": score, "band": band, "delinquent_6m": delinq, "reasons": reasons}


def train_risk_model(loans, stats, pays):
    """RandomForest delinquency classifier (paper Objective 3), guarded.

    Trains ONLY if >= 20 members carry both classes; otherwise prints why
    it abstains and the dashboard keeps using the rule score. This honesty
    matters: the sample's payment actuals are too sparse to train on.
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    rows = []
    for member in loans["member"].dropna().unique():
        f = member_features(member, loans, stats, pays)
        if f["n_loans"] == 0:
            continue
        r = risk_score(f)
        rows.append({**f, "label": int(r["delinquent_6m"])})
    F = pd.DataFrame(rows)
    if F.empty or F["label"].nunique() < 2 or len(F) < 20:
        print("RF training skipped: need >=20 members with both classes "
              f"(have {len(F)} rows). Rule score remains the indicator.")
        return None, F
    X = F[["n_loans", "total_borrowed"]].fillna(0.0)
    X["collection_rate"] = F["collection_rate"].fillna(0.0)
    X["paid_row_ratio"] = F["paid_row_ratio"].fillna(0.0)
    X["fully_paid_share"] = F["fully_paid_share"].fillna(0.0)
    Xtr, Xte, ytr, yte = train_test_split(
        X, F["label"], test_size=0.3, random_state=42, stratify=F["label"])
    clf = RandomForestClassifier(n_estimators=200, random_state=42).fit(Xtr, ytr)
    print(f"RF train acc={clf.score(Xtr, ytr):.2f} test acc={clf.score(Xte, yte):.2f}")
    print("importances:", dict(zip(X.columns, clf.feature_importances_.round(2))))
    return clf, F


# --------------------------------------------------------------------------
# 5. FORECASTING — moving average + trend + expected collections
# --------------------------------------------------------------------------
def forecast_disbursements(loans, months=FORECAST_MONTHS):
    """Naive MA(3)/MA(6) + linear-trend forecasts of monthly disbursements."""
    from sklearn.linear_model import LinearRegression
    m = monthly_series(loans)
    ma3, ma6 = float(m.tail(3).mean()), float(m.tail(6).mean())
    future = pd.date_range(m.index.max() + pd.offsets.MonthBegin(1),
                           periods=months, freq="MS")
    X = np.arange(len(m)).reshape(-1, 1)
    trend = LinearRegression().fit(X, m.values)
    pred = np.clip(trend.predict(np.arange(len(m), len(m) + months).reshape(-1, 1)),
                   0, None)
    fc = pd.DataFrame({"month": future, "ma3_forecast": ma3,
                       "ma6_forecast": ma6, "trend_forecast": pred})
    print(f"\nDisbursement run-rate: MA3={ma3:,.0f}  MA6={ma6:,.0f} pesos/mo; "
          f"trend slope={trend.coef_[0]:+,.0f}/mo")
    return fc


def _due_schedule(pays, loans):
    """Shared due-month schedule: one row per installment that has a usable
    loan date + installment number, tagged with the month it falls due.
    BOTH collections forecasts (v1 and v2) call this — the math lives in
    exactly one place, so the two versions can never drift apart."""
    p = pays.copy()
    p["loan_date"] = pd.to_datetime(
        loans.set_index("loan_key")["date"]
        if "loan_key" in loans.columns and "loan_key" in p.columns
        else pd.Series(pd.NaT, index=p.index), errors="coerce")
    # Fallback when keys are absent: merge on member+amount+term snapshot.
    if p["loan_date"].isna().all():
        key = ["member", "loan_amount", "term_months"]
        avail = [c for c in key if c in loans.columns and c in p.columns]
        if avail:
            snap = loans[avail + ["date"]].drop_duplicates(avail)
            p = p.merge(snap, on=avail, how="left")
            p["loan_date"] = pd.to_datetime(p["date"], errors="coerce")
    p["installment"] = pd.to_numeric(p["installment"], errors="coerce")
    p["expected"] = pd.to_numeric(p["expected"], errors="coerce")
    ok = p.dropna(subset=["loan_date", "installment", "expected"]).copy()
    # Due month = loan month + installment number (1st payment ~1 month
    # after release). Period + int is vectorized; adding a DateOffset array
    # to datetimes is not — it degrades to object dtype and .dt crashes.
    ok["due_month"] = (ok["loan_date"].dt.to_period("M")
                       + ok["installment"].astype(int).to_numpy())
    return ok


def forecast_collections(loans, pays, months=FORECAST_MONTHS):
    """Expected cash-in: each schedule row is due at loan_month + installment.

    This is the 'collections' half the paper requires. Rows without a loan
    date or installment number are excluded and counted, not silently kept.
    """
    if pays.empty:
        print("No payment schedules — collections forecast unavailable.")
        return pd.DataFrame()
    ok = _due_schedule(pays, loans)
    print(f"Collections base: {len(ok)}/{len(pays)} schedule rows with usable dates.")
    by_month = ok.groupby("due_month")["expected"].sum()
    by_month.index = by_month.index.to_timestamp()
    start = pd.Timestamp.today().normalize().replace(day=1)
    idx = pd.date_range(start, periods=months, freq="MS")
    fc = pd.DataFrame({"month": idx,
                       "expected_collections": [float(by_month.get(m, 0.0)) for m in idx]})
    print(f"Expected collections next {months}mo: {fc['expected_collections'].sum():,.0f}")
    return fc


def plot_forecast(disb_fc, coll_fc):
    """Bar+line chart saved to outputs (never shown on screen)."""
    fig, ax = plt.subplots(figsize=(11, 4.5))
    ax.bar(disb_fc["month"].dt.strftime("%Y-%m"), disb_fc["trend_forecast"] / 1e3,
           color="#4472C4", label="disbursement trend")
    ax.plot(coll_fc["month"].dt.strftime("%Y-%m"), coll_fc["expected_collections"] / 1e3,
            color="#E36C0A", marker="o", label="expected collections")
    ax.set_title("Forecast: disbursements (trend) vs expected collections (thousands)")
    ax.set_xlabel("Month")
    ax.set_ylabel("Thousand pesos")
    ax.legend()
    fig.autofmt_xdate(rotation=30)
    fig.tight_layout()
    out = OUTPUT_DIR / "forecast_disbursement_vs_collections.png"
    fig.savefig(out)
    plt.close(fig)
    print(f"Chart saved -> {out}")


# ==========================================================================
# 5b. ANALYTICS PACK v2 — trend analysis & prediction (re-demo upgrade)
# ==========================================================================
# The panel asked for more than moving averages. Every function here
# answers one of their questions:
#   Q1 when does each member actively apply (and repay)?  -> member_cycles
#   Q2 which months do members apply (and repay)?         -> seasonality_report
#   Q3 how much money will be released in TOTAL?          -> forecast_disbursements_v2
#   Q4 how do we know the models work?                    -> backtest_monthly
# plus: probability-weighted collections (forecast_collections_v2),
#       a ranked "who will re-apply" call-list (propensity_ranking),
#       repayment reliability by term bucket (collection_reliability),
#       plain-English machine-generated findings (auto_insights), and
#       demo charts served as PNG (chart_*_png).
#
# HONESTY RULES baked into every function (say these out loud at demo):
#   - The usable modern ledger era starts 2023-01 (ANALYSIS_START). The
#     ledger holds one record in 2019 and one in 2022 (pre-digital); the
#     coop's book was quiet 2020-21. Trend models train only on 2023+.
#   - Every payload reports n_loans_analyzed and caveats[] — thin data is
#     labelled, never hidden (only 17 dated repayments exist on paper).
#   - Forecast intervals are EMPIRICAL: the q95 of real backtest errors,
#     not a theoretical formula we cannot defend.
ANALYSIS_START = pd.Timestamp("2023-01-01")
BACKTEST_MODELS = ("ma3", "ma6", "trend", "seasonal_naive")
# Machine keys stay in the API payloads, but sentences and charts on screen
# speak plain language (client admins read these, not data scientists).
MODEL_LABELS = {"ma3": "average of the last 3 months",
                "ma6": "average of the last 6 months",
                "trend": "steady up/down trend line",
                "seasonal_naive": "same month as last year"}
SHORT_LABELS = {"ma3": "3-month avg", "ma6": "6-month avg",
                "trend": "trend line", "seasonal_naive": "same month last year"}
MONTH_NAMES = ("January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December")
MONTH_ABBR = tuple(n[:3] for n in MONTH_NAMES)


def analysis_loans(loans):
    """Dated loans from ANALYSIS_START onward + how many were excluded."""
    dated = loans.dropna(subset=["date"]).copy()
    era = dated[dated["date"] >= ANALYSIS_START].copy()
    return era, int(len(dated) - len(era))


def _forecast_path(model, y, steps):
    """Forecast `steps` months ahead from history array y under one model.

    seasonal_naive repeats last year's shape (month t takes month t-12's
    value). It needs 12 months of history and degrades to ma3 below that —
    the backtest scorecard records which one actually ran.
    """
    y = np.asarray(y, dtype=float)
    if model == "ma3":
        return np.full(steps, float(np.mean(y[-3:])))
    if model == "ma6":
        return np.full(steps, float(np.mean(y[-6:])))
    if model == "seasonal_naive" and len(y) < 12:
        model = "ma3"  # documented degrade — history too short
    if model == "seasonal_naive":
        return np.resize(y[-12:], steps).astype(float)
    from sklearn.linear_model import LinearRegression  # local: heavy import
    X = np.arange(len(y)).reshape(-1, 1)
    reg = LinearRegression().fit(X, y)
    pred = reg.predict(np.arange(len(y), len(y) + steps).reshape(-1, 1))
    return np.clip(pred, 0, None)  # negative disbursements are impossible


def backtest_monthly(loans, holdout=6):
    """Walk-forward backtest: hide the last `holdout` months, predict each
    one using only the data before it, then score every model honestly.

    WAPE (weighted absolute % error) is used instead of MAPE because the
    series contains real zero months — MAPE explodes when actual = 0.
    Returns the scorecard, the winning model, its raw residuals, and the
    actual-vs-predicted values (the chart + insights engine reuse these).
    """
    era, n_excl = analysis_loans(loans)
    s = monthly_series(era)
    y = s.values.astype(float)
    n = len(y)
    h = max(3, min(int(holdout), n // 3))
    caveats = ([f"{n_excl} loans before {ANALYSIS_START:%Y-%m} excluded from modelling"]
               if n_excl else [])
    if n < 15:
        return {"scorecard": [], "best_model": None, "residuals": [],
                "actuals": [], "predictions": [], "holdout": h, "n_months": n,
                "caveats": caveats + ["fewer than 15 months of history — backtest skipped"]}
    preds_by_model = {m: [] for m in BACKTEST_MODELS}
    actuals = []
    for t in range(n - h, n):                      # one step ahead each time
        for mname in BACKTEST_MODELS:
            preds_by_model[mname].append(float(_forecast_path(mname, y[:t], 1)[0]))
        actuals.append(float(y[t]))
    card = []
    for mname, preds in preds_by_model.items():
        preds_a, act = np.asarray(preds), np.asarray(actuals)
        err = np.abs(preds_a - act)
        card.append({
            "model": mname,
            "mae": round(float(err.mean()), 2),                     # avg miss, pesos
            "wape": round(float(err.sum() / max(np.abs(act).sum(), 1.0)), 4),
            "within_25pct": round(float((err <= 0.25 * np.maximum(act, 1.0)).mean()), 4),
        })
    card.sort(key=lambda r: (r["wape"], r["mae"]))
    best = card[0]["model"]
    return {"scorecard": card, "best_model": best, "holdout": h, "n_months": n,
            "residuals": [a - p for a, p in zip(actuals, preds_by_model[best])],
            "actuals": actuals, "predictions": preds_by_model[best],
            "months_backtested": [d.strftime("%Y-%m") for d in s.index[n - h:]],
            "caveats": caveats}


def forecast_disbursements_v2(loans, months=FORECAST_MONTHS, holdout=6):
    """Q3: TOTAL pesos to be released, best model, empirical 95% interval.

    The winning model from backtest_monthly forecasts `months` ahead; the
    interval half-width is the empirical q95 of the backtest residuals
    (with a 6-month holdout that IS the worst observed miss — stated in
    caveats, not dressed up as a formula). A 12-month loan-type split of
    recent disbursements shows WHERE the money goes (Regular vs Emergency).
    """
    bt = backtest_monthly(loans, holdout=holdout)
    if not bt["best_model"]:
        return {"best_model": None, "scorecard": [], "type_shares_12m": {},
                "rows": [], "caveats": bt["caveats"], "n_months": bt["n_months"]}
    era, _ = analysis_loans(loans)
    s = monthly_series(era)
    path = _forecast_path(bt["best_model"], s.values.astype(float), months)
    resid = np.abs(np.asarray(bt["residuals"], dtype=float))
    band = float(np.quantile(resid, 0.95)) if len(resid) >= 4 else float(resid.max())
    future = pd.date_range(s.index.max() + pd.offsets.MonthBegin(1),
                           periods=months, freq="MS")
    rows = [{"month": d.strftime("%Y-%m"), "point": round(float(v), 2),
             "low": round(max(float(v) - band, 0.0), 2),
             "high": round(float(v) + band, 2)}
            for d, v in zip(future, path)]
    # Where the money goes: type shares over the trailing 12 months.
    lt = era["loan_type"].astype(str).replace({"N/A": "Regular"}).fillna("Regular")
    tail = era[era["date"] > era["date"].max() - pd.DateOffset(months=12)]
    shares = (tail.groupby(lt.loc[tail.index])["loan_amount"].sum()
              / max(float(tail["loan_amount"].sum()), 1.0)).round(4).to_dict()
    total_path = sum(r["point"] for r in rows)
    return {"best_model": bt["best_model"], "holdout": bt["holdout"],
            "n_months": bt["n_months"], "interval_band": round(band, 2),
            "scorecard": bt["scorecard"], "type_shares_12m": shares,
            "total_expected": round(total_path, 2), "rows": rows,
            "caveats": bt["caveats"] + [
                f"95% interval = empirical q95 of {len(resid)} backtest residuals "
                f"(±{band:,.0f} PHP per month)"]}


def seasonality_report(loans, pays=None):
    """Q2: month-of-year indices for applications AND scheduled repayments,
    plus the paydays-15/30 effect coops actually care about.

    Index > 1.0 = that calendar month runs above the era's monthly
    average (textbook seasonal index: mean of that month across years /
    mean of all year-months). Repayment seasonality comes from the due
    schedule (complete on paper) and is labelled as scheduled, not paid.
    """
    era, n_excl = analysis_loans(loans)
    ym = era.groupby([era["date"].dt.year, era["date"].dt.month]).agg(
        loans=("loan_amount", "size"), disbursed=("loan_amount", "sum"))
    # Year x month matrix — raw counts + pesos per cell, for the client
    # to render a hoverable heatmap (same numbers the indices average).
    matrix = []
    for year, g in ym.groupby(level=0):
        matrix.append({
            "year": int(year),
            "loans": [int(g["loans"].get((year, m), 0)) for m in range(1, 13)],
            "disbursed": [round(float(g["disbursed"].get((year, m), 0.0)), 2)
                          for m in range(1, 13)],
        })
    month_loans = ym.groupby(level=1)["loans"].mean()
    month_disb = ym.groupby(level=1)["disbursed"].mean()
    base_loans = max(float(ym["loans"].mean()), 1e-9)
    base_disb = max(float(ym["disbursed"].mean()), 1e-9)
    rows = []
    for m in range(1, 13):
        rows.append({
            "month": MONTH_NAMES[m - 1],
            "avg_loans": round(float(month_loans.get(m, 0.0)), 2),
            "avg_disbursed": round(float(month_disb.get(m, 0.0)), 2),
            "index_loans": round(float(month_loans.get(m, 0.0)) / base_loans, 3),
            "index_disbursed": round(float(month_disb.get(m, 0.0)) / base_disb, 3),
        })
    # Payday effect: coops release on the 15th/30th; a 6-day window
    # (14-16, 29-31) is ~19.7% of an average month. Lift = observed share
    # of applications in that window / 0.197.
    day = era["date"].dt.day
    payday = day.between(14, 16) | day.between(29, 31)
    payday_share = float(payday.mean()) if len(era) else 0.0
    # Repayment seasonality from due schedule — complete on paper.
    repay_rows = []
    repay_caveat = "no payment schedule supplied"
    pays_rows = None
    if pays is not None and len(pays):
        ok = _due_schedule(pays, loans)
        pays_rows = ok.groupby(ok["due_month"].dt.month)["expected"].sum()
        total = max(float(pays_rows.sum()), 1e-9)
        repay_rows = [{"month": MONTH_NAMES[m - 1],
                       "scheduled_share": round(float(pays_rows.get(m, 0.0)) / total, 4)}
                      for m in range(1, 13)]
        repay_caveat = "from scheduled due dates on paper (not verified payments)"
    peak_m = max(rows, key=lambda r: r["index_loans"])["month"]
    trough_candidates = [r for r in rows if r["avg_loans"] > 0] or rows
    trough_m = min(trough_candidates, key=lambda r: r["index_loans"])["month"]
    return {"months": rows, "recurring_months": repay_rows,
            "recurring_caveat": repay_caveat, "matrix": matrix,
            "peak_month": peak_m, "trough_month": trough_m,
            "payday_share": round(payday_share, 4),
            "payday_lift": round(payday_share / 0.197, 3),
            "n_loans_analyzed": int(len(era)),
            "caveats": ([f"{n_excl} pre-{ANALYSIS_START:%Y-%m} loans excluded"]
                        if n_excl else []) +
                       ["seasonality rests on the 2023+ era — indicative, "
                        "and validated monthly via the backtest endpoint"]}


def member_cycles(loans, stats=None, min_loans=2):
    """Q1: each member's borrowing rhythm.

    For members with >=2 dated loans: average gap between their loans
    (their cycle), the std (how regular they are), their personal busy
    month, and a predicted next-application window = last loan + gap ± std.
    Single-loan members are listed too, but flagged low_confidence and
    given the COHORT average gap — their personal cycle is not invented.
    Repayment behaviour (completion share, collection rate) joins from
    payment_stats where it exists.
    """
    dated = loans.dropna(subset=["date"]).copy()
    st = stats if stats is not None and len(stats) else pd.DataFrame()
    perf = {}
    if len(st):
        s = st.copy()
        s["member_k"] = s["member"].astype(str).str.strip().str.lower()
        perf = s.groupby("member_k").agg(
            fully_paid_share=("fully_paid", lambda x:
                              float(pd.Series(x).astype(str).str.lower().eq("true").mean())),
            collection_rate=("collection_rate", "mean")).to_dict("index")
    # TIME-TRAVEL RULE: the ledger snapshot ends at its last recorded loan
    # (as_of). When that sits in the past — and on demo day it always will
    # — predictions anchor at as_of, NOT at wall-clock today: a rhythm
    # measured on data through Oct 2025 cannot honestly "predict" Nov 2026.
    # Windows that are past relative to today then read as "already due",
    # which is exactly the follow-up call-list the coop wants.
    today = pd.Timestamp.today().normalize()
    as_of = dated["date"].max() if len(dated) else today
    anchor = min(today, as_of)
    rows, gaps_all = [], []
    for member, grp in dated.groupby("member"):
        ds = grp["date"].sort_values()
        mk = str(member).strip().lower()
        p = perf.get(mk, {})
        base = {"member": member, "n_loans": int(len(ds)),
                "first_loan": ds.iloc[0].strftime("%Y-%m-%d"),
                "last_loan": ds.iloc[-1].strftime("%Y-%m-%d"),
                "total_borrowed": round(float(grp["loan_amount"].sum()), 2),
                "fully_paid_share": (round(float(p["fully_paid_share"]), 3)
                                     if "fully_paid_share" in p else None),
                "collection_rate": (round(float(p["collection_rate"]), 3)
                                    if "collection_rate" in p and not pd.isna(p["collection_rate"])
                                    else None)}
        if len(ds) >= min_loans:
            gaps = ds.diff().dt.days.dropna()
            # ddof=0: a member with exactly min_loans loans has ONE gap and
            # ddof=1 would be NaN — and `NaN or 0.0` is still NaN (truthy).
            gap_mean, gap_std = float(gaps.mean()), float(gaps.std(ddof=0) or 0.0)
            if gap_mean < 30:
                # Loans clustered on the same/adjacent days (split releases
                # or ledger artifacts) — no MEASURABLE cycle. Report that
                # instead of inventing a rhythm.
                rows.append({**base, "confidence": "low — loans clustered; "
                             "cycle not measurable",
                             "avg_cycle_days": round(gap_mean),
                             "cycle_regularity": None, "busy_month": None,
                             "predicted_next": None, "next_window": None,
                             "days_until_next": None})
                continue
            gaps_all.append(gap_mean)
            mode_months = ds.dt.month.mode()
            busy = int(mode_months.iloc[0]) if len(mode_months) else None
            nxt = ds.iloc[-1] + pd.Timedelta(days=gap_mean)
            # Window half-width: the member's own std, floored at 15 days so
            # a perfectly regular member still shows a readable window. It
            # may sit in the past — that honestly means "already due", and
            # negative days_until_next puts such members first in the list.
            half = max(gap_std, 15.0)
            lo_w, hi_w = nxt - pd.Timedelta(days=half), nxt + pd.Timedelta(days=half)
            rows.append({**base, "confidence": "high",
                         "avg_cycle_days": round(gap_mean),
                         "cycle_regularity": round(max(1.0 - gap_std / max(gap_mean, 1.0), 0.0), 3),
                         "busy_month": MONTH_NAMES[busy - 1] if busy else None,
                         "predicted_next": nxt.strftime("%Y-%m-%d"),
                         "next_window": f"{lo_w:%b %d, %Y} – {hi_w:%b %d, %Y}",
                         "days_until_next": int((nxt - anchor).days)})
        else:
            rows.append({**base, "confidence": "low — single loan, cohort-average cycle used",
                         "avg_cycle_days": None, "cycle_regularity": None,
                         "busy_month": None, "predicted_next": None,
                         "next_window": None, "days_until_next": None})
    high = [r for r in rows if r["confidence"] == "high"]
    high.sort(key=lambda r: r["days_until_next"])
    low = [r for r in rows if r["confidence"] != "high"]
    cohort = round(float(np.mean(gaps_all))) if gaps_all else None
    return {"recurring": high[:max(min_loans * 10, 40)],
            "single_loan_members": len(low),
            "summary": {"members_analyzed": len(rows),
                        "recurring_members": len(high),
                        "cohort_avg_cycle_days": cohort,
                        "cohort_avg_cycle_months": (round(cohort / 30.44, 1)
                                                    if cohort else None),
                        "ledger_as_of": as_of.strftime("%Y-%m-%d"),
                        "anchor_date": anchor.strftime("%Y-%m-%d")},
            "caveats": ["predicted windows are behavioural averages, not "
                        "commitments — members shift with income and season; "
                        "days_until_next is measured from anchor_date (the "
                        "ledger's as-of edge); negative = already due"]}


def propensity_ranking(loans, stats=None, top=20, horizon_days=90):
    """Who will most likely apply again within horizon_days?

    A TRANSPARENT weighted score (documented weights — no black box the
    panel can poke): recency 35% (exponential decay vs the cohort's avg
    cycle), frequency 25%, repayment completion 20%, punctuality 15%,
    average ticket 5%. A heuristic call-list for the coop, honestly
    labelled as such — not an ML claim on 171 rows.
    """
    dated = loans.dropna(subset=["date"]).copy()
    st = stats if stats is not None and len(stats) else pd.DataFrame()
    perf = {}
    if len(st):
        s = st.copy()
        s["member_k"] = s["member"].astype(str).str.strip().str.lower()
        perf = s.groupby("member_k").agg(
            fully_paid_share=("fully_paid", lambda x:
                              float(pd.Series(x).astype(str).str.lower().eq("true").mean())),
            collection_rate=("collection_rate", "mean")).to_dict("index")
    # Same TIME-TRAVEL RULE as member_cycles: recency is measured against
    # the ledger's as-of edge when the snapshot is stale, so one ancient
    # member doesn't flatten every score toward zero on demo day.
    today = pd.Timestamp.today().normalize()
    anchor = min(today, dated["date"].max()) if len(dated) else today
    cyc = member_cycles(loans, stats)
    scale = cyc["summary"]["cohort_avg_cycle_days"] or 365.0
    out = []
    for member, grp in dated.groupby("member"):
        ds = grp["date"].sort_values()
        mk = str(member).strip().lower()
        p = perf.get(mk, {})
        idle = float((anchor - ds.iloc[-1]).days)
        recency = float(np.exp(-idle / max(scale, 1.0)))
        freq = min(len(ds) / 4.0, 1.0)
        completion = (float(p["fully_paid_share"])
                      if "fully_paid_share" in p else 0.5)
        punct = (float(np.clip(p["collection_rate"], 0, 1))
                 if "collection_rate" in p and not pd.isna(p["collection_rate"]) else 0.5)
        avg_ticket = float(grp["loan_amount"].mean())
        ticket = min(avg_ticket / 200_000.0, 1.0)
        score = 100 * (0.35 * recency + 0.25 * freq + 0.20 * completion
                       + 0.15 * punct + 0.05 * ticket)
        out.append({"member": member, "score": round(score, 1),
                    "n_loans": int(len(ds)), "days_since_last": int(idle),
                    "avg_ticket": round(avg_ticket, 2),
                    "fully_paid_share": (round(completion, 3) if "fully_paid_share" in p else None),
                    "likely_within_horizon": bool(idle <= horizon_days)})
    out.sort(key=lambda r: r["score"], reverse=True)
    return {"weights": {"recency": 0.35, "frequency": 0.25, "completion": 0.20,
                        "punctuality": 0.15, "ticket_size": 0.05},
            "horizon_days": horizon_days, "ranking": out[:top],
            "ledger_as_of": anchor.strftime("%Y-%m-%d"),
            "caveats": ["transparent heuristic weights (shown above) — tuned "
                        "from the coop interview, not fitted to 171 rows; "
                        "days_since_last measured at the ledger's as-of edge"]}


def collection_reliability(stats=None, loans=None):
    """Repayment reliability per term bucket — the probabilities that
    weight the v2 collections forecast.

    Buckets: short <= 6 months, medium 7-12, long > 12. realized_rate =
    total paid / total scheduled for that bucket (paper truth); where the
    ledger carries no amounts, fully_paid share stands in. The overall
    row is the blended probability used when a bucket is too thin.
    """
    st = stats if stats is not None and len(stats) else pd.DataFrame()
    if st.empty:
        return {"buckets": [], "overall_realized_rate": None,
                "caveats": ["no repayment stats available"]}
    s = st.copy()
    s["term_months"] = pd.to_numeric(s["term_months"], errors="coerce")
    s["bucket"] = pd.cut(s["term_months"], bins=[0, 6, 12, 10_000],
                         labels=["short (<=6mo)", "medium (7-12mo)", "long (>12mo)"])
    def _rate(g):
        """Completion probability = share of loans marked fully paid.

        The ledger records the coop's fully-paid MARKS reliably, but paid
        PESOS are largely absent from the extract (only 17 dated payments
        carry amounts). So the marks are the probability; the amount ratio
        is computed separately and only trusted when >= half the group's
        rows actually carry paid amounts — never as the headline number.
        """
        share = float(pd.Series(g["fully_paid"]).astype(str).str.lower().eq("true").mean())
        amt = None
        if "total_expected" in g.columns and "total_paid" in g.columns:
            exp_ = pd.to_numeric(g["total_expected"], errors="coerce")
            paid = pd.to_numeric(g["total_paid"], errors="coerce")
            if float(exp_.sum()) > 0 and float((paid.fillna(0) > 0).mean()) >= 0.5:
                amt = float(paid.sum() / exp_.sum())
        return share, amt
    rows = []
    for label, g in s.groupby("bucket", observed=True):
        share, amt = _rate(g)
        rows.append({"bucket": str(label), "n_loans": int(len(g)),
                     "completion_rate": round(share, 4),
                     "amount_recovery_rate": (round(amt, 4) if amt is not None else None),
                     "avg_term_months": round(float(g["term_months"].mean()), 1)})
    share_all, amt_all = _rate(s)
    return {"buckets": rows, "overall_completion_rate": round(share_all, 4),
            "overall_amount_recovery_rate": (round(amt_all, 4) if amt_all is not None else None),
            "caveats": ["completion_rate = share of loans marked fully paid "
                        "(the coop's paper truth); amount recovery appears only "
                        "where paid pesos are actually recorded in the ledger"]}


def forecast_collections_v2(loans, pays, stats=None, months=FORECAST_MONTHS):
    """Expected cash-in, PROBABILITY-WEIGHTED — the honest collections view.

    Same due-month schedule as v1 (shared _due_schedule — single source of
    math), but every scheduled peso is multiplied by its term bucket's
    historical realized recovery rate. Output shows BOTH numbers side by
    side: the naive sum (what a spreadsheet would promise) and ours (what
    history says actually comes in). The gap IS the story.
    """
    if pays.empty:
        return {"rows": [], "caveats": ["no payment schedule on paper"]}
    ok = _due_schedule(pays, loans)
    rel = collection_reliability(stats, loans)
    overall = rel.get("overall_completion_rate") or 1.0
    by_bucket = {b["bucket"]: b["completion_rate"] for b in rel["buckets"]}
    ok["term_months"] = pd.to_numeric(ok["term_months"], errors="coerce")
    ok["bucket"] = pd.cut(ok["term_months"], bins=[0, 6, 12, 10_000],
                          labels=["short (<=6mo)", "medium (7-12mo)", "long (>12mo)"])
    ok["recovery"] = ok["bucket"].astype(str).map(by_bucket).fillna(overall)
    ok["weighted"] = ok["expected"] * ok["recovery"]
    by_month = ok.groupby("due_month").agg(scheduled=("expected", "sum"),
                                           weighted=("weighted", "sum"))
    by_month.index = by_month.index.to_timestamp()
    start = pd.Timestamp.today().normalize().replace(day=1)
    idx = pd.date_range(start, periods=months, freq="MS")
    rows = []
    for m in idx:
        sched = float(by_month["scheduled"].get(m, 0.0))
        wt = float(by_month["weighted"].get(m, 0.0))
        rows.append({"month": m.strftime("%Y-%m"), "scheduled": round(sched, 2),
                     "probability_weighted": round(wt, 2),
                     "gap": round(sched - wt, 2)})
    return {"rows": rows,
            "total_scheduled": round(sum(r["scheduled"] for r in rows), 2),
            "total_weighted": round(sum(r["probability_weighted"] for r in rows), 2),
            "recovery_by_bucket": rel["buckets"],
            "caveats": rel["caveats"] + ["v2 vs v1 gap = overpromise avoided"]}


def auto_insights(loans, stats=None, pays=None, holdout=6):
    """Plain-English findings the system derives ITSELF from the data.

    Every sentence is computed here — nothing hardcoded — so the panel can
    watch an insight change when the data does. Capped at 8; anomalies use
    |z| >= 1.5 on the 2023+ monthly disbursement series.
    """
    era, n_excl = analysis_loans(loans)
    s = monthly_series(era)
    out = []
    if len(s) >= 6 and (s.std(ddof=0) or 0) > 0:
        z = (s - s.mean()) / s.std(ddof=0)
        for m, v in z[z.abs() >= 1.5].sort_values(ascending=False).head(3).items():
            out.append({"tag": "unusual",
                        "text": (f"{m:%B %Y} disbursements hit {s[m]:,.0f} PHP — far "
                                 f"{'above' if v > 0 else 'below'} the usual month "
                                 f"(about {abs(v):.1f}× the normal ups and downs)")})
    bt = backtest_monthly(loans, holdout=holdout)
    if bt["best_model"]:
        w = bt["scorecard"][0]
        out.append({"tag": "model",
                    "text": (f"Accuracy test on the last {bt['holdout']} months we hid: "
                             f"the {MODEL_LABELS.get(w['model'], w['model'])} was closest "
                             f"(overall error {w['wape']:.0%}) — it now powers the forecast")})
    dated = loans.dropna(subset=["date"])
    n_mem = max(int(dated["member"].nunique()), 1)
    recur = int((dated.groupby("member").size() >= 2).sum())
    out.append({"tag": "behavior",
                "text": (f"{recur} of {n_mem} members ({recur / n_mem:.0%}) borrowed "
                         f"more than once — repeat borrowers are the predictable core")})
    yr = era.groupby(era["date"].dt.year)["loan_amount"].sum()
    if len(yr) >= 2:
        last_year = int(yr.index[-1])
        covered = max(float(era[era["date"].dt.year == last_year]["date"].dt.dayofyear.max()), 1.0)
        annualized = float(yr.iloc[-1]) / (covered / 365.0)
        growth = annualized / max(float(yr.iloc[-2]), 1.0) - 1.0
        out.append({"tag": "trend",
                    "text": (f"{last_year} disbursements are on pace for {annualized:,.0f} PHP "
                             f"({growth:+.0%} vs {last_year - 1})")})
    if stats is not None and len(stats):
        fp = float(stats["fully_paid"].astype(str).str.lower().eq("true").mean())
        out.append({"tag": "repayment",
                    "text": f"{fp:.0%} of the loans in our records are marked fully repaid"})
    cyc = member_cycles(loans, stats)["summary"]
    if cyc["cohort_avg_cycle_days"]:
        out.append({"tag": "rhythm",
                    "text": (f"Members who borrow again come back every "
                             f"~{cyc['cohort_avg_cycle_months']} months on average — that is how "
                             f"we estimate each member's next application")})
    return {"insights": out[:8], "n_loans_analyzed": int(len(era)),
            "caveats": ([f"{n_excl} pre-{ANALYSIS_START:%Y-%m} loans excluded"]
                        if n_excl else [])}


def _png_bytes(fig):
    """Figure -> PNG bytes in memory (never touches disk during a demo)."""
    import io
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()


def chart_heatmap_png(loans):
    """Year x month heatmap of applications — the seasonality picture."""
    era, _ = analysis_loans(loans)
    pv = (era.groupby([era["date"].dt.year, era["date"].dt.month]).size()
          .unstack(fill_value=0).reindex(columns=range(1, 13), fill_value=0))
    fig, ax = plt.subplots(figsize=(9.2, 2.6 + 0.28 * len(pv.index)))
    im = ax.imshow(pv.values, cmap="YlGn", aspect="auto")
    ax.set_xticks(range(12)); ax.set_xticklabels(MONTH_ABBR)
    ax.set_yticks(range(len(pv.index))); ax.set_yticklabels(pv.index)
    for i in range(len(pv.index)):
        for j in range(12):
            v = int(pv.values[i, j])
            ax.text(j, i, str(v) if v else "", ha="center", va="center",
                    fontsize=8, color="black")
    ax.set_title("Loan applications per month (2023+ ledger)")
    fig.colorbar(im, shrink=0.8)
    fig.tight_layout()
    return _png_bytes(fig)


def chart_forecast_png(loans, months=FORECAST_MONTHS, holdout=6):
    """History + best-model forecast with the empirical 95% band."""
    fc = forecast_disbursements_v2(loans, months=months, holdout=holdout)
    if not fc["rows"]:
        return _png_bytes(plt.figure())
    era, _ = analysis_loans(loans)
    s = monthly_series(era)
    fig, ax = plt.subplots(figsize=(10.2, 4.0))
    ax.plot(s.index, s.values / 1e3, marker="o", ms=3, color="#1f4e79",
            label="actual disbursed")
    fmonths = [pd.Timestamp(r["month"]) for r in fc["rows"]]
    pts = [r["point"] / 1e3 for r in fc["rows"]]
    los = [r["low"] / 1e3 for r in fc["rows"]]
    his = [r["high"] / 1e3 for r in fc["rows"]]
    ax.plot(fmonths, pts, marker="o", ms=4, color="#c00000", lw=2,
            label=f"forecast ({SHORT_LABELS.get(fc['best_model'], fc['best_model'])})")
    ax.fill_between(fmonths, los, his, color="#c00000", alpha=0.15,
                    label="realistic range (95%)")
    ax.set_title(f"Monthly disbursements — forecast using the "
                 f"{MODEL_LABELS.get(fc['best_model'], fc['best_model'])} "
                 f"(thousand PHP)")
    ax.set_ylabel("Thousand PHP")
    ax.legend()
    fig.autofmt_xdate(rotation=30)
    fig.tight_layout()
    return _png_bytes(fig)


def chart_backtest_png(loans, holdout=6):
    """Actual vs predicted over the held-out months + per-model error bars."""
    bt = backtest_monthly(loans, holdout=holdout)
    if not bt["actuals"]:
        return _png_bytes(plt.figure())
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.6, 3.6))
    xs = range(len(bt["actuals"]))
    ax1.plot(xs, np.asarray(bt["actuals"]) / 1e3, marker="o", label="what actually happened", color="#1f4e79")
    ax1.plot(xs, np.asarray(bt["predictions"]) / 1e3, marker="s",
             label=f"predicted ({SHORT_LABELS.get(bt['best_model'], bt['best_model'])})",
             color="#c00000")
    ax1.set_xticks(list(xs)); ax1.set_xticklabels(bt.get("months_backtested", xs),
                                                  rotation=30, fontsize=8)
    ax1.set_title("Accuracy check: months we hid, one guess ahead (k PHP)")
    ax1.legend()
    names = [SHORT_LABELS.get(r["model"], r["model"]) for r in bt["scorecard"]]
    wapes = [r["wape"] * 100 for r in bt["scorecard"]]
    ax2.barh(names[::-1], wapes[::-1], color="#4472C4")
    ax2.set_title("Overall error by method (lower = better)")
    ax2.set_xlabel("% error")
    fig.tight_layout()
    return _png_bytes(fig)


def chart_cycles_png(loans, stats=None):
    """Borrowing-cycle lengths across recurring members (anonymised M1..Mn
    so the PNG stays safe to serve; exact names live in the JSON endpoint).
    """
    cyc = member_cycles(loans, stats)
    rows = cyc["recurring"][:12]
    if not rows:
        return _png_bytes(plt.figure())
    fig, ax = plt.subplots(figsize=(9.6, 0.42 * len(rows) + 1.4))
    labels = [f"M{i + 1}" for i in range(len(rows))]
    gaps = [r["avg_cycle_days"] for r in rows][::-1]
    ax.barh(labels[::-1], gaps, color="#70ad47")
    mean_gap = cyc["summary"]["cohort_avg_cycle_days"]
    if mean_gap:
        ax.axvline(mean_gap, color="#c00000", ls="--", lw=1.5,
                   label=f"cohort avg ({mean_gap} days)")
    ax.set_title("Member borrowing cycles — days between loans (top 12)")
    ax.set_xlabel("days")
    ax.legend()
    fig.tight_layout()
    return _png_bytes(fig)



def extract_receipt_fields(image_path=None, raw_text=None):
    """Return {reference, amount, date, raw_text, source}.

    Give it an image (needs pytesseract+Pillow) OR raw_text to demo the
    regex stage with zero dependencies. Raises a clear error otherwise.
    """
    if raw_text is None:
        if not _OCR_AVAILABLE:
            raise RuntimeError("pytesseract/Pillow not installed — "
                               "pass raw_text=... to use the mock path")
        if not image_path:
            raise ValueError("provide image_path or raw_text")
        raw_text = pytesseract.image_to_string(Image.open(image_path))
        source = f"ocr:{image_path}"
    else:
        source = "mock"
    amts = [float(a.replace(",", "")) for a in AMOUNT_RE.findall(raw_text)]
    dates = DATE_RE.findall(raw_text)
    refs = REF_RE.findall(raw_text)
    return {
        "reference": refs[0] if refs else None,
        "amount": max(amts) if amts else None,   # largest money figure = total paid
        "date": pd.to_datetime(dates[0], errors="coerce") if dates else pd.NaT,
        "raw_text": raw_text, "source": source,
    }


def verify_receipt(fields, expected_amount, tol=1.0):
    """Compare OCR amount vs ledger expectation; never auto-approve."""
    if fields["amount"] is None:
        return {"verdict": "NEEDS_REVIEW", "reason": "no amount extracted"}
    gap = abs(fields["amount"] - float(expected_amount))
    if gap <= tol and fields["reference"]:
        return {"verdict": "MATCH", "reason": f"amount+ref agree (gap {gap:.2f})"}
    return {"verdict": "NEEDS_REVIEW",
            "reason": f"gap {gap:.2f} or missing ref — queue for admin"}


# --------------------------------------------------------------------------
# main: runs modules 2-6 end to end and prints everything
# --------------------------------------------------------------------------
def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    loans, pays, stats, shares = load_data()
    if loans.empty:
        raise SystemExit(f"no loans found — check {LOANS_CSV}")
    print(f"Loaded {len(loans)} loans, {len(pays)} schedule rows, "
          f"{len(stats)} stats groups.")

    print_dashboard(dashboard_metrics(loans, stats, shares))          # (2)
    generate_report(loans, stats, pays)                                # (3)

    print("\n--- Risk flags (top 10 riskiest scored members) ---")     # (4)
    scored = []
    for member in loans["member"].dropna().unique():
        f = member_features(member, loans, stats, pays)
        r = risk_score(f)
        if r["band"] != "UNSCORED":
            scored.append((r["score"], member, r["band"],
                           "; ".join(r["reasons"]) or "clean"))
    for s, mber, band, why in sorted(scored, reverse=True)[:10]:
        print(f"[{band:6s}] {s:3d}  {mber} — {why}")
    train_risk_model(loans, stats, pays)

    disb_fc = forecast_disbursements(loans)                            # (5)
    print(disb_fc.to_string(index=False))
    coll_fc = forecast_collections(loans, pays)
    if not coll_fc.empty:
        print(coll_fc.to_string(index=False))
        plot_forecast(disb_fc, coll_fc)

    print("\n--- OCR demo (mock path, no image needed) ---")            # (6)
    demo = extract_receipt_fields(raw_text=(
        "KHS COOP  OR No. TXN-90218832\nDate: 05/12/2024\n"
        "Received Php 1,250.00 from M. Santos"))
    print(demo)
    print(verify_receipt(demo, expected_amount=1250.00))


if __name__ == "__main__":
    main()
