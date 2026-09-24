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
# 0. PATHS — set these two to match your machine, everything else derives.
# --------------------------------------------------------------------------
DATA_DIR = Path("/home/gustave/Documents/data-science-portfolio/data")
OUTPUT_DIR = Path("/home/gustave/Documents/data-science-portfolio/outputs")

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
    """Append a PENDING application; creates the store file on first use."""
    app_id = f"APP-{pd.Timestamp.today():%Y%m%d}-001"
    if APPLICATIONS_CSV.exists():
        apps = pd.read_csv(APPLICATIONS_CSV, keep_default_na=False)
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


def forecast_collections(loans, pays, months=FORECAST_MONTHS):
    """Expected cash-in: each schedule row is due at loan_month + installment.

    This is the 'collections' half the paper requires. Rows without a loan
    date or installment number are excluded and counted, not silently kept.
    """
    if pays.empty:
        print("No payment schedules — collections forecast unavailable.")
        return pd.DataFrame()
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
    print(f"Collections base: {len(ok)}/{len(p)} schedule rows with usable dates.")
    # Due month = loan month + installment number (1st payment ~1 month
    # after release). Period + int is vectorized; adding a DateOffset array
    # to datetimes is not — it degrades to object dtype and .dt crashes.
    ok["due_month"] = (ok["loan_date"].dt.to_period("M")
                       + ok["installment"].astype(int).to_numpy())
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


# --------------------------------------------------------------------------
# 6. OCR-ASSISTED RECEIPT VERIFICATION — real lib, mock fallback
# --------------------------------------------------------------------------
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
