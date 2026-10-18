"""UCMS analytics backend (FastAPI) — paper module: Data Analytics & Forecasting.

Two layers in one service:

1. ANALYTICS API  (/dashboard, /forecast/*, /risk/*, /reports/*, /receipt/*)
   Raw compute over scripts/ucms_analytics.py — DataFrames as JSON.

2. PORTAL API  (/portal/*)  — NEW
   Same data, reshaped to the exact objects the Vue Pinia stores consume,
   so swapping a store from mocks to live data means changing the data
   source, not the views. Field names mirror web/src/stores/*.js:
     members: memberNo (KHS-0001…), firstName/lastName, status, dateJoined…
     loans:   loanNo (LOAN-0001…), type value, principal, ratePercent,
              termMonths, totalDue (diminishing closed form), status
              Paid/Released, payments[{at, amount, channel}], balance…
   Delinquency rule mirrors loans.js isDelinquent(): Released + 6+ months
   since last activity. Unknown CSV fields become "" / 0 / None — never
   invented (see `source_notes` in each payload).

Run (from capstone-main/):
  cd backend
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000        # docs at /docs
"""

from __future__ import annotations

import json
import math
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import ucms_analytics as ua  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store import load_all  # noqa: E402  (Supabase-first, CSV fallback)
from loan_simulator import loan_totals, round2  # noqa: E402  (single impl, shared with web)

API_KEY = os.environ.get("UCMS_API_KEY", "")  # empty = dev-open, warns at startup
# Comma-separated frontend origin(s) allowed to call this API in browsers.
CORS_ORIGINS = [o.strip() for o in
                os.environ.get("UCMS_CORS_ORIGINS", "http://localhost:5173").split(",")
                if o.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not API_KEY:
        print("WARNING: UCMS_API_KEY unset — API is open. "
              "Set it in backend/.env before any demo.")
    yield


app = FastAPI(title="UCMS Analytics API", version="0.2.0", lifespan=lifespan)

# Browsers block cross-origin fetch by default: the Vite dev server
# (http://localhost:5173) may call this API only because of this middleware.
# In production, set UCMS_CORS_ORIGINS to the deployed frontend origin(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_key(x_api_key: str | None = Header(default=None)):
    """Shared-secret gate for the admin portal. Empty env = dev-open (warns)."""
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad or missing X-API-Key")
    return True


def frame_rows(df: pd.DataFrame):
    """DataFrame -> JSON-safe list (Timestamps/numpy break plain json)."""
    if df is None or len(df) == 0:
        return []
    return json.loads(df.to_json(orient="records", date_format="iso"))


def plain(value, fallback):
    """Unwrap FastAPI Query() defaults for direct (notebook) calls.

    Over HTTP, FastAPI resolves `Query(default=...)` into a plain value.
    Called directly, the raw Query object arrives instead — which is never
    a str/int/float, so anything else falls back to the default.
    """
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return fallback


def jsonable(v):
    """Scalar -> JSON-safe (NaN/NaT -> None, numpy -> native, time -> iso)."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


# round2 now lives in loan_simulator (half-up, single definition) and is
# imported above - do not re-define it here or the two drift apart.


def load():
    loans, pays, stats, shares = load_all()  # Supabase live, else CSVs
    if loans.empty:
        raise HTTPException(status_code=503,
                            detail="no loans found — check data/ CSVs or Supabase")
    return loans, pays, stats, shares


class EligibilityIn(BaseModel):
    member: str
    amount: float
    term_months: int
    loan_type: str = "Regular"


class ApplicationIn(BaseModel):
    member: str
    amount: float
    term_months: int
    loan_type: str = "Regular"
    purpose: str = ""


class ReviewIn(BaseModel):
    decision: str
    reviewer: str = ""
    reason: str = ""


class ReceiptIn(BaseModel):
    raw_text: str
    expected_amount: float
    tol: float = 1.0


@app.get("/health")
def health():
    require_key()
    return {"ok": True, "service": "ucms-analytics"}


@app.get("/dashboard")
def dashboard(_: bool = require_key()):
    loans, _pays, stats, shares = load()
    m = ua.dashboard_metrics(loans, stats, shares)
    return {k: jsonable(v) for k, v in m.items()}


@app.post("/eligibility")
def eligibility(body: EligibilityIn, _: bool = require_key()):
    loans, _pays, _stats, shares = load()
    ok, reasons = ua.check_eligibility(body.member, body.amount,
                                       body.term_months, loans, shares,
                                       body.loan_type)
    return {"eligible": ok, "reasons": reasons}


@app.post("/applications")
def create_application(body: ApplicationIn, _: bool = require_key()):
    app_id = ua.submit_application(body.member, body.amount,
                                   body.term_months, body.loan_type,
                                   body.purpose)
    return {"app_id": app_id, "status": "PENDING"}


@app.post("/applications/{app_id}/review")
def review_application(app_id: str, body: ReviewIn, _: bool = require_key()):
    try:
        return ua.review_application(app_id, body.decision,
                                     body.reviewer, body.reason)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/forecast/disbursements")
def forecast_disbursements(months: int = Query(default=6, ge=1, le=24),
                           _: bool = require_key()):
    months = plain(months, 6)
    loans, _pays, _stats, _shares = load()
    return frame_rows(ua.forecast_disbursements(loans, months=months))


@app.get("/forecast/collections")
def forecast_collections(months: int = Query(default=6, ge=1, le=24),
                         _: bool = require_key()):
    months = plain(months, 6)
    loans, pays, _stats, _shares = load()
    return frame_rows(ua.forecast_collections(loans, pays, months=months))


# NOTE: static sub-paths must be registered BEFORE /risk/{member} —
# FastAPI matches in order, otherwise "delinquent" is read as a name.
@app.get("/risk/delinquent")
def delinquent_list(limit: int = Query(default=20, ge=1, le=100),
                    _: bool = require_key()):
    """Riskiest members first — feeds Dashboard's Delinquent card and the
    Reports delinquent-accounts table (replaces client-side mock math)."""
    limit = plain(limit, 20)
    loans, pays, stats, _shares = load()
    out = []
    for member in loans["member"].dropna().unique():
        feat = ua.member_features(str(member), loans, stats, pays)
        score = ua.risk_score(feat)
        if score.get("band") in ("HIGH", "MEDIUM") or score.get("delinquent_6m"):
            out.append({
                "member": str(member),
                "n_loans": int(feat["n_loans"]),
                "total_borrowed": float(feat["total_borrowed"]),
                "score": jsonable(score.get("score")),
                "band": score.get("band"),
                "delinquent_6m": bool(score.get("delinquent_6m")),
                "reasons": score.get("reasons", []),
            })
    # Highest score first; unscored (None) sink to the bottom.
    out.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
    return out[:limit]


@app.get("/risk/{member}")
def risk(member: str, _: bool = require_key()):
    loans, pays, stats, _shares = load()
    feat = ua.member_features(member, loans, stats, pays)
    score = ua.risk_score(feat)
    return {
        "features": {k: jsonable(v) for k, v in feat.items()},
        "score": jsonable(score.get("score")),
        "band": score.get("band"),
        "delinquent_6m": bool(score.get("delinquent_6m")),
        "reasons": score.get("reasons", []),
    }


@app.get("/reports/summary")
def reports_summary(_: bool = require_key()):
    """One-pager JSON for the Reports Financial Summary section + BOD export."""
    loans, pays, stats, _shares = load()
    by_type = (
        loans.groupby("loan_type")["loan_amount"].agg(["size", "sum"]).reset_index()
        if "loan_type" in loans.columns else pd.DataFrame()
    )
    paid_total = (float(pd.to_numeric(pays["paid"], errors="coerce").fillna(0).sum())
                  if not pays.empty and "paid" in pays.columns else 0.0)
    terms = (sorted(int(t) for t in
                    pd.to_numeric(loans["term_months"], errors="coerce")
                    .dropna().unique()) if len(loans) else [])
    delinq = sum(
        1 for m in loans["member"].dropna().unique()
        if ua.risk_score(ua.member_features(str(m), loans, stats, pays))
        .get("delinquent_6m")
    )
    return {
        "loans_released": len(loans),
        "total_disbursed": float(loans["loan_amount"].sum()) if len(loans) else 0.0,
        "collected_recorded": paid_total,
        "delinquent_members": int(delinq),
        "terms_offered": terms,
        "by_type": frame_rows(by_type),
    }


@app.get("/analytics/by-term")
def by_term(_: bool = require_key()):
    """Loans + pesos per term selection — feeds forecast/term charts."""
    loans, _pays, _stats, _shares = load()
    if len(loans) == 0:
        return []
    t = (loans.groupby("term_months")
         .agg(n_loans=("loan_amount", "size"),
              total=("loan_amount", "sum"),
              average=("loan_amount", "mean")).reset_index())
    return frame_rows(t)


# --------------------------------------------------------------------------
# PORTAL API — frontend-shaped resources (mirror web/src/stores/*.js).
# A store swap = change the data source, never the views.
# --------------------------------------------------------------------------
# Frontend loan types (stores/loans.js LOAN_TYPES) carry rates:
#   Regular/Education/Transportation/Gadget/Emergency 1.5%, Business 2.0%.
# The CSVs only ever say "Emergency Loan" or nothing ("N/A"), so N/A maps
# to Regular and is flagged type_source="inferred" — the honest fallback
# until Supabase rows carry real types.
TYPE_RATES = {"Regular": 1.5, "Education": 1.5, "Transportation": 1.5,
              "Gadget": 1.5, "Business": 2.0, "Emergency": 1.5}


def portal_loan_type(raw) -> tuple:
    s = str(raw or "").strip().lower()
    if "emerg" in s:
        return "Emergency", "stated"
    return "Regular", "inferred"


def portal_rate(loan_type: str) -> float:
    return TYPE_RATES.get(loan_type, 1.5)


def portal_total_due(principal: float, rate: float, term) -> float:
    """Diminishing closed form, same as web/src/utils/amortization.js:
    total = principal + rate% x principal x (months+1)/2."""
    # loan_totals() zeroes out on a non-positive/garbage term; the portal has
    # always fallen back to the bare principal there so a malformed row still
    # shows something owed. Keep that fallback or totalDue drops to 0.
    try:
        invalid = int(float(term)) <= 0
    except (TypeError, ValueError):
        invalid = True
    if invalid:
        return round2(principal)
    return loan_totals(principal, rate, term)["total_due"]


def split_name(raw: str) -> tuple:
    """"Dela Cruz, Myla" -> (Myla, Dela Cruz); "Myla Dela Cruz" likewise."""
    s = " ".join(str(raw or "Unknown").split())
    if "," in s:
        last, first = [p.strip() for p in s.split(",", 1)]
        return (first or "Unknown", last or "")
    parts = s.split()
    if len(parts) == 1:
        return (parts[0], "")
    return (" ".join(parts[:-1]), parts[-1])


def iso_or_none(value):
    d = pd.to_datetime(value, errors="coerce")
    return None if pd.isna(d) else d.isoformat()


def months_since(value, today=None) -> int | None:
    """Whole calendar months elapsed — mirrors loans.js monthsSince()."""
    d = pd.to_datetime(value, errors="coerce")
    if pd.isna(d):
        return None
    today = pd.Timestamp.today().normalize() if today is None else today
    return (today.year - d.year) * 12 + (today.month - d.month)


def keyed(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure a canonical loan_key using the SAME normalizer as parse_loans.

    payments.csv / payment_stats.csv don't always carry the column, so
    recompute it from raw fields — otherwise every schedule row goes
    unattributed (paid sums stay 0, everything looks Released/delinquent).
    """
    if df.empty:
        return df
    df = df.copy()
    if "loan_key" not in df.columns:
        get = lambda c: df[c] if c in df.columns else None
        df["loan_key"] = [
            ua.make_loan_key(s, m, a, t, d)
            for s, m, a, t, d in zip(get("sheet"), get("member"),
                                     get("loan_amount"), get("term_months"),
                                     get("date_raw"))
        ]
    return df


def portal_loan_rows(loans: pd.DataFrame, pays: pd.DataFrame,
                     stats: pd.DataFrame):
    """All loans as frontend loan objects, deterministically numbered."""
    ordered = loans.sort_values(
        ["date", "loan_amount", "member"], na_position="last").reset_index(drop=True)
    pays, stats = keyed(pays), keyed(stats)
    pay_by_key = {}
    if not pays.empty and "loan_key" in pays.columns:
        for key, grp in pays.groupby("loan_key"):
            pay_by_key[key] = grp.sort_values("installment").to_dict("records")
    fully_paid = set()
    if (not stats.empty and "fully_paid" in stats.columns
            and "loan_key" in stats.columns):
        fully_paid = set(stats.loc[stats["fully_paid"].astype(str) == "True",
                                   "loan_key"])
    rows = []
    for i, loan in ordered.iterrows():
        key = loan.get("loan_key")
        member = str(loan.get("member") or "Unknown")
        first, last = split_name(member)
        ltype, tsource = portal_loan_type(loan.get("loan_type"))
        rate = portal_rate(ltype)
        principal = round2(loan.get("loan_amount"))
        term = loan.get("term_months")
        try:
            term = int(float(term))
        except (TypeError, ValueError):
            term = None
        total_due = portal_total_due(principal, rate, term)
        sched = pay_by_key.get(key, [])
        payments, paid_sum = [], 0.0
        for j, inst in enumerate(sched):
            paid = inst.get("paid")
            recorded = paid is not None and not (isinstance(paid, float)
                                                 and math.isnan(paid))
            amt = round2(paid) if recorded else round2(inst.get("expected"))
            paid_sum += round2(paid) if recorded else 0.0
            payments.append({
                "id": j + 1,
                "at": iso_or_none(inst.get("date_paid")),
                "amount": amt,
                "channel": "",
                "note": "" if recorded else "scheduled — no actual recorded",
                "recorded": bool(recorded),
            })
        balance = round2(max(0.0, total_due - paid_sum))
        status = "Paid" if key in fully_paid or balance <= 0.01 else "Released"
        # Last activity mirrors loans.js: last payment date, else issue date.
        dates = [p["at"] for p in payments if p["at"]]
        last_activity = max(dates) if dates else iso_or_none(loan.get("date"))
        idle = months_since(last_activity)
        delinquent = bool(status == "Released" and idle is not None and idle >= 6)
        history = [{
            "at": iso_or_none(loan.get("date")) or "",
            "action": f"Loan issued — {ltype} {principal:,.2f}",
            "by": "System",
        }]
        for p in payments:
            if p["at"]:
                history.append({
                    "at": p["at"],
                    "action": f"Payment recorded — {p['amount']:,.2f}",
                    "by": "System",
                })
        rows.append({
            "id": int(i) + 1,
            "loanNo": f"LOAN-{int(i) + 1:04d}",
            "memberName": member,
            "firstName": first,
            "lastName": last,
            "type": ltype,
            "type_source": tsource,
            "principal": principal,
            "ratePercent": rate,
            "termMonths": term,
            "totalDue": total_due,
            "paidTotal": round2(paid_sum),
            "balance": balance,
            "status": status,
            "delinquent": delinquent,
            "monthsIdle": idle,
            "lastActivity": last_activity,
            "releasedAt": iso_or_none(loan.get("date")),
            "createdAt": iso_or_none(loan.get("date")),
            "payments": payments,
            "history": sorted(history, key=lambda h: h["at"] or "", reverse=True),
            "source_notes": ("type inferred as Regular (unstated in source); "
                             "channels/co-makers/requirements live in "
                             "Supabase, not the sample CSVs") if tsource == "inferred" else "",
        })
    return rows


def portal_member_rows(loans: pd.DataFrame):
    """One row per member name. Unknown CSV fields stay "" / 0 / None —
    shaped for the views, never invented."""
    names = sorted({str(m).strip() for m in loans["member"].dropna()
                    if str(m).strip()})
    rows = []
    for i, name in enumerate(names):
        first, last = split_name(name)
        hl = loans[loans["member"].astype(str).str.strip() == name]
        first_date = hl["date"].min() if "date" in hl.columns else pd.NaT
        rows.append({
            "id": int(i) + 1,
            "memberNo": f"KHS-{int(i) + 1:04d}",
            "memberName": name,
            "firstName": first,
            "lastName": last,
            "status": "Active",
            "memberType": "Regular",
            "email": "",
            "phone": "",
            "address": "",
            "dateJoined": iso_or_none(first_date),
            "capitalShare": 0,
            "n_loans": int(len(hl)),
            "totalBorrowed": round2(hl["loan_amount"].sum()) if len(hl) else 0.0,
            "account": {"loginEnabled": True, "mustChangePassword": False,
                        "tempPassword": None},
            "history": [],
            "source_notes": ("identity/capital/contact live in Supabase; "
                             "CSV sample carries names + loan dates only"),
        })
    return rows


@app.get("/portal/members")
def portal_members(_: bool = require_key()):
    """MembersView shape: memberNo, names, status, dates. Unknown fields
    are "" / 0 / None (see source_notes) — never invented."""
    loans, _pays, _stats, _shares = load()
    return portal_member_rows(loans)


@app.get("/portal/loans")
def portal_loans(status: str = Query(default="All"),
                 loan_type: str = Query(default="All"),
                 _: bool = require_key()):
    """LoansView shape incl. payments[], balance, delinquent flag."""
    status, loan_type = plain(status, "All"), plain(loan_type, "All")
    loans, pays, stats, _shares = load()
    rows = portal_loan_rows(loans, pays, stats)
    if status != "All":
        rows = [r for r in rows if r["status"] == status]
    if loan_type != "All":
        rows = [r for r in rows if r["type"] == loan_type]
    return rows


@app.get("/portal/dashboard")
def portal_dashboard(_: bool = require_key()):
    """The four Dashboard cards + attention items + recent activity,
    computed with the same rules as the Vue computed props."""
    loans, pays, stats, _shares = load()
    members = portal_member_rows(loans)
    loan_rows = portal_loan_rows(loans, pays, stats)
    released = [r for r in loan_rows if r["status"] == "Released"]
    delinq = [r for r in loan_rows if r["delinquent"]]
    outstanding = round2(sum(r["balance"] for r in released))
    delinq_amt = round2(sum(r["balance"] for r in delinq))
    attention = []
    if delinq:
        attention.append({
            "to": "/loans",
            "text": (f"{len(delinq)} delinquent loan"
                     f"{'s' if len(delinq) > 1 else ''} — {delinq_amt:,.2f}"),
            "tone": "text-red-600 font-medium",
        })
    events = []
    for r in loan_rows:
        for h in r["history"]:
            events.append({"at": h["at"], "label": f"{r['loanNo']} · {r['memberName']}",
                           "action": h["action"], "kind": "loan"})
    events.sort(key=lambda e: e["at"] or "", reverse=True)
    return {
        "cards": {
            "totalMembers": len(members),
            "activeMembers": sum(1 for m in members if m["status"] == "Active"),
            "activeLoans": len(released),
            "outstandingBalance": outstanding,
            "dailyIncome": None,
            "monthIncome": None,
            "delinquentCount": len(delinq),
            "delinquentAmount": delinq_amt,
            "income_note": ("ledger/income lives in Supabase, not the sample "
                            "CSVs — Daily Income tiles stay Supabase-direct"),
        },
        "attention": attention,
        "recentActivity": events[:8],
    }


@app.get("/portal/applications")
def portal_applications(_: bool = require_key()):
    """ApplicationsView shape. The sample tree has no filed applications
    yet (loan_applications.csv absent) — returns [] honestly, mapped when
    present. Statuses map PENDING->Pending, APPROVED->Approved,
    REJECTED->Rejected (frontend also knows Under Review/Returned)."""
    import csv as _csv
    path = ua.APPLICATIONS_CSV if hasattr(ua, "APPLICATIONS_CSV") else None
    rows = []
    status_map = {"PENDING": "Pending", "APPROVED": "Approved",
                  "REJECTED": "Rejected"}
    if path is not None and Path(path).exists():
        with open(path, newline="") as f:
            for j, app in enumerate(_csv.DictReader(f)):
                first, last = split_name(app.get("member", ""))
                rows.append({
                    "id": j + 1,
                    "appNo": app.get("app_id", ""),
                    "firstName": first,
                    "lastName": last,
                    "status": status_map.get(str(app.get("status", "")).upper(),
                                             app.get("status", "")),
                    "submittedAt": iso_or_none(app.get("date_submitted")),
                    "amount": round2(app.get("amount")),
                    "termMonths": app.get("term_months"),
                    "loanType": app.get("loan_type", ""),
                })
    return {"rows": rows,
            "note": ("empty until applications are filed via POST /applications; "
                     "Under Review/Returned statuses live in Supabase flow") if not rows else ""}


@app.post("/report")
def report(_: bool = require_key()):
    loans, pays, stats, _shares = load()
    out = ua.generate_report(loans, stats, pays)
    return FileResponse(path=out, filename=Path(out).name,
                        media_type="application/vnd.openxmlformats-"
                                   "officedocument.spreadsheetml.sheet")


@app.post("/receipt/verify")
def receipt_verify(body: ReceiptIn, _: bool = require_key()):
    fields = ua.extract_receipt_fields(raw_text=body.raw_text)
    verdict = ua.verify_receipt(fields, body.expected_amount, body.tol)
    fields["date"] = jsonable(fields.get("date"))
    return {"fields": fields, **verdict}
