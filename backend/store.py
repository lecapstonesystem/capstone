"""Supabase-backed data layer for the UCMS backend.

Priority chain (first non-empty source wins):
  1. Supabase (live rows) — needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
  2. Local CSVs (offline fallback via ucms_analytics.load_data)

Output frames keep the EXACT CSV shapes the analytics functions expect
(loans/pays/stats/shares with loan_key etc.), so every caller —
forecasts, risk scoring, portal endpoints — works unchanged on either
source. The active source is printed on every load (no secrets in logs).

SECURITY: the service_role key bypasses ALL RLS. It is read from env,
held only in this module, and never printed, logged, or returned.
"""

from __future__ import annotations

import os

import pandas as pd

import ucms_analytics as ua

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_PAID_STATUSES = {"paid", "fully_paid", "fully paid", "closed", "complete"}


def supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def get_client():
    """service_role client, or None (missing env/lib/connection).

    The import is lazy so the backend still boots (CSV mode) on machines
    without the `supabase` package installed.
    """
    if not supabase_configured():
        return None
    try:
        from supabase import create_client
    except ImportError:
        print("data source: supabase lib missing (pip install supabase) "
              "-> csv fallback")
        return None
    try:
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    except Exception as exc:  # key material must never reach logs
        print(f"data source: supabase init failed ({type(exc).__name__}) "
              f"-> csv fallback")
        return None


def _fetch_all(client, table: str):
    """All rows, paged (PostgREST caps single responses at 1000)."""
    rows, start, size = [], 0, 1000
    while True:
        batch = client.table(table).select("*").range(start, start + size - 1) \
            .execute().data or []
        rows.extend(batch)
        if len(batch) < size:
            return rows
        start += size


def frames_from_supabase(client):
    """Supabase rows -> CSV-shaped (loans, pays, stats, shares) frames."""
    members = pd.DataFrame(_fetch_all(client, "member"))
    loans_raw = pd.DataFrame(_fetch_all(client, "loan"))
    pays_raw = pd.DataFrame(_fetch_all(client, "payment"))
    shares_raw = pd.DataFrame(_fetch_all(client, "share_capital"))

    id2name = {}
    if not members.empty:
        id2name = dict(zip(members["member_id"].astype(int),
                           members["name"].astype(str)))

    # ---- loans ----
    loans = pd.DataFrame([{
        "sheet": "",
        "member": id2name.get(int(r.get("member_id") or -1), "Unknown"),
        "loan_amount": float(r.get("amount") or 0),
        "term_months": (int(r["term_months"]) if r.get("term_months") is not None
                        else None),
        "date_raw": r.get("date_issued"),
        "date": pd.to_datetime(r.get("date_issued"), errors="coerce"),
        "loan_type": r.get("loan_type") or "N/A",
        "interest_rate": (float(r["interest_rate"])
                          if r.get("interest_rate") is not None else 0.015),
    } for _, r in loans_raw.iterrows()]) if not loans_raw.empty \
        else pd.DataFrame(columns=["sheet", "member", "loan_amount",
                                   "term_months", "date_raw", "date",
                                   "loan_type", "interest_rate"])
    if not loans.empty:
        loans["loan_key"] = [
            ua.make_loan_key(s, m, a, t, d) for s, m, a, t, d in
            zip(loans["sheet"], loans["member"], loans["loan_amount"],
                loans["term_months"], loans["date_raw"])]

    loan_date = dict(zip(loans.get("loan_key", []), loans.get("date", []))) \
        if not loans.empty else {}
    loan_member = dict(zip(loans.get("loan_key", []), loans.get("member", []))) \
        if not loans.empty else {}
    loan_amount = dict(zip(loans.get("loan_key", []), loans.get("loan_amount", []))) \
        if not loans.empty else {}
    loan_term = dict(zip(loans.get("loan_key", []), loans.get("term_months", []))) \
        if not loans.empty else {}
    # supabase loan PK -> canonical key, to attach payment rows
    supa_key = {}
    if not loans_raw.empty and not loans.empty:
        for (_, r), key in zip(loans_raw.iterrows(), loans["loan_key"]):
            try:
                supa_key[int(r["loan_id"])] = key
            except (TypeError, ValueError):
                pass

    # ---- pays (actual payment rows; schedules are derived, not stored) ----
    pays = pd.DataFrame([{
        "sheet": "",
        "member": loan_member.get(supa_key.get(_lid(r.get("loan_id"))), "Unknown"),
        "loan_amount": loan_amount.get(supa_key.get(_lid(r.get("loan_id")))),
        "term_months": loan_term.get(supa_key.get(_lid(r.get("loan_id")))),
        "date_raw": None,
        "installment": r.get("installment_no"),
        "expected": (float(r["expected_amount"])
                     if r.get("expected_amount") is not None else None),
        "paid": (float(r["amount"]) if r.get("amount") is not None else None),
        "date_paid_raw": r.get("date"),
        "date_paid": pd.to_datetime(r.get("date"), errors="coerce"),
        "loan_key": supa_key.get(_lid(r.get("loan_id"))),
    } for _, r in pays_raw.iterrows()]) if not pays_raw.empty \
        else pd.DataFrame(columns=["sheet", "member", "loan_amount",
                                   "term_months", "date_raw", "installment",
                                   "expected", "paid", "date_paid_raw",
                                   "date_paid", "loan_key"])

    # ---- stats (per-loan rollups; same semantics as payment_stats.csv) ----
    loan_status = {}
    if not loans_raw.empty and not loans.empty:
        for (_, r), key in zip(loans_raw.iterrows(), loans["loan_key"]):
            loan_status[key] = str(r.get("status") or "")
    stat_rows = []
    groups = {}
    if not pays.empty:
        for _k, _g in pays.groupby("loan_key"):
            groups[_k] = _g
    for key in loans.get("loan_key", []):
        grp = groups.get(key)
        if grp is not None and len(grp):
            exp = pd.to_numeric(grp["expected"], errors="coerce").fillna(0).sum()
            got = pd.to_numeric(grp["paid"], errors="coerce").fillna(0).sum()
            n_paid = int(grp["paid"].notna().sum())
            n_dates = int(grp["date_paid"].notna().sum())
            n_inst = int(pd.to_numeric(grp["installment"],
                                       errors="coerce").max()) if n_paid or len(grp) else 0
            member = grp["member"].iloc[0] if len(grp) else "Unknown"
        else:
            # No payment rows recorded: the DB loan.status column (seeded from
            # the coop's paper records) is the evidence of record; totals are 0.
            exp = got = 0.0
            n_paid = n_dates = n_inst = 0
            member = loan_member.get(key, "Unknown")
        done = (loan_status.get(key, "").lower() in _PAID_STATUSES
                or (exp > 0 and got >= exp - 0.01))
        stat_rows.append({
            "loan_key": key,
            "member": member,
            "n_installments": n_inst,
            "total_expected": float(exp),
            "total_paid": float(got),
            "n_paid_rows": n_paid,
            "n_dates": n_dates,
            "fully_paid": bool(done),
            "collection_rate": float(got / exp) if exp > 0 else 0.0,
            "paid_row_ratio": float(n_paid / n_inst) if n_inst > 0 else 0.0,
        })
    stats = pd.DataFrame(stat_rows)

    # ---- shares (member name + summed capital, as check_eligibility reads) ----
    shares = pd.DataFrame(columns=["member", "capital_share"])
    if not shares_raw.empty:
        shares_raw = shares_raw.copy()
        shares_raw["member"] = shares_raw["member_id"].astype(int).map(id2name) \
            .fillna("Unknown")
        shares_raw["capital_share"] = pd.to_numeric(shares_raw["amount"],
                                                    errors="coerce").fillna(0)
        shares = shares_raw.groupby("member", as_index=False)["capital_share"].sum()
    return loans, pays, stats, shares


def _lid(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


def load_all():
    """(loans, pays, stats, shares) from Supabase, else CSV fallback."""
    client = get_client()
    if client is not None:
        try:
            frames = frames_from_supabase(client)
            if len(frames[0]) > 0:
                print(f"data source: supabase ({len(frames[0])} loans)")
                return frames
            print("data source: supabase reachable but empty -> csv fallback")
        except Exception as exc:
            print(f"data source: supabase read failed ({type(exc).__name__}) "
                  f"-> csv fallback")
    else:
        print("data source: csv fallback "
              "(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset or lib missing)")
    return ua.load_data()
