"""Seed Supabase from the sample CSVs (members, loans, ACTUAL payments only).

  .venv/bin/python scripts/seed_supabase.py --dry-run   # offline, no creds needed
  .venv/bin/python scripts/seed_supabase.py --apply     # needs env below

Env (never printed, never committed):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Rules (all deliberate, all printed in the summary):
  * Members named Unknown/blank are SKIPPED (data-quality rejects).
  * Loans without a valid issue date are SKIPPED (date_issued is NOT NULL).
  * Only payment rows WITH an actual paid amount are seeded; purely
    scheduled rows are projections — the forecast recomputes them.
  * Loan status is evidence-based (paid >= expected -> Paid, else Released);
    the sample's paper "Fully Paid" flags are NOT seeded as truth.
  * Idempotent: existing rows are matched first (by name / by
    member+amount+date+term / by loan+installment); re-runs insert only
    what's missing, with explicit IDs from max(id)+1 in batches of 500.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve()
DATA_DIR = Path(os.environ.get("UCMS_DATA_DIR", HERE.parents[1] / "data"))

SKIP_NAMES = {"unknown", ""}


def norm_name(value) -> str:
    return " ".join(str(value or "").split())


def key_of(member: str, amount, term, date_iso: str) -> tuple:
    try:
        a = round(float(amount), 2)
    except (TypeError, ValueError):
        a = 0.0
    try:
        t = int(float(term))
    except (TypeError, ValueError):
        t = -1
    return (member.strip().lower(), a, t, date_iso or "")


def iso(value):
    d = pd.to_datetime(value, errors="coerce")
    return None if pd.isna(d) else d.strftime("%Y-%m-%d")


def add_months(date_iso: str, n, fallback_n: int = 12) -> str:
    try:
        n = int(float(n))
    except (TypeError, ValueError):
        n = fallback_n
    d = pd.to_datetime(date_iso) + pd.DateOffset(months=n)
    return d.strftime("%Y-%m-%d")


def load_sample():
    loans = pd.read_csv(DATA_DIR / "loans_clean.csv", keep_default_na=False)
    pays = pd.read_csv(DATA_DIR / "payments.csv", keep_default_na=False) \
        if (DATA_DIR / "payments.csv").exists() else pd.DataFrame()
    loans["loan_amount"] = pd.to_numeric(loans["loan_amount"], errors="coerce")
    loans["date_iso"] = loans["date"].apply(iso) if "date" in loans.columns \
        else loans["date_raw"].apply(iso)
    if not pays.empty:
        pays["paid_num"] = pd.to_numeric(pays["paid"], errors="coerce")
        pays["exp_num"] = pd.to_numeric(pays["expected"], errors="coerce")
        pays["inst_num"] = pd.to_numeric(pays["installment"], errors="coerce")
    return loans, pays


def build_plan(loans: pd.DataFrame, pays: pd.DataFrame):
    """Pure-offline plan: members/loans/payments to insert + skip report."""
    members, loans_out, pays_out = [], [], []
    skipped = {"unknown_member": 0, "no_date": 0, "schedule_only": 0}
    seen: set[str] = set()

    pay_groups: dict[tuple, list] = {}
    if not pays.empty:
        for _, r in pays.iterrows():
            pay_groups.setdefault(
                key_of(r.get("member"), r.get("loan_amount"),
                       r.get("term_months"), iso(r.get("date_raw"))), []).append(r)

    for _, r in loans.iterrows():
        name = norm_name(r.get("member"))
        if name.strip().lower() in SKIP_NAMES:
            skipped["unknown_member"] += 1
            continue
        date_iso = r.get("date_iso")
        # NaN is truthy in Python: empty CSV dates arrive as float nan
        # (not None), so `not date_iso` alone never caught them and
        # add_months crashed on NaT.strftime. pd.isna covers None/NaN/NaT.
        if not date_iso or pd.isna(date_iso):
            skipped["no_date"] += 1
            continue
        if name not in seen:
            seen.add(name)
            members.append({"name": name, "date_joined": date_iso})
        term = r.get("term_months")
        loan_key = key_of(name, r.get("loan_amount"), term, date_iso)
        rows = pay_groups.get(loan_key, [])
        actuals = [x for x in rows if pd.notna(x.get("paid_num"))]
        # `nan or 0` yields nan (NaN is truthy), which poisons the sum and
        # makes the Paid/Released evidence check unreachable — count blanks
        # as 0 instead.
        exp = sum(float(x.get("exp_num")) if pd.notna(x.get("exp_num"))
                  else 0.0 for x in rows)
        got = sum(float(x.get("paid_num") or 0) for x in actuals)
        loans_out.append({
            "_key": (name, loan_key),
            "member_name": name,
            "amount": round(float(r.get("loan_amount") or 0), 2),
            "interest_rate": float(r.get("interest_rate") or 0.015),
            "date_issued": date_iso,
            "due_date": add_months(date_iso, term),
            "status": ("Paid" if exp > 0 and got >= exp - 0.01 else "Released"),
            "term_months": (int(float(term)) if pd.notna(term) else None),
            "loan_type": ("Emergency" if "emerg" in str(r.get("loan_type") or "")
                          .lower() else "Regular"),
        })
        for x in actuals:
            pays_out.append({
                "_key": (name, loan_key),
                "installment_no": (int(x["inst_num"])
                                   if pd.notna(x.get("inst_num")) else None),
                "expected_amount": (round(float(x["exp_num"]), 2)
                                    if pd.notna(x.get("exp_num")) else None),
                "amount": round(float(x["paid_num"]), 2),
                "date": iso(x.get("date_paid")) or date_iso,
                "status": "Recorded",
            })
    skipped["schedule_only"] = max(0, len(pays) - len(pays_out))
    return members, loans_out, pays_out, skipped


def get_client():
    url, key = os.environ.get("SUPABASE_URL", ""), \
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not (url and key):
        raise SystemExit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env")
    from supabase import create_client
    return create_client(url, key)


def fetch_all(client, table: str, cols: str):
    rows, start = [], 0
    while True:
        batch = client.table(table).select(cols).range(start, start + 499) \
            .execute().data or []
        rows.extend(batch)
        if len(batch) < 500:
            return rows
        start += 500


def main():
    ap = argparse.ArgumentParser(description="Seed Supabase from sample CSVs")
    ap.add_argument("--apply", action="store_true",
                    help="write to Supabase (default is --dry-run)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the plan without writing (this is the default)")
    args = ap.parse_args()

    loans, pays = load_sample()
    members, loans_out, pays_out, skipped = build_plan(loans, pays)
    print(f"plan: {len(members)} members, {len(loans_out)} loans, "
          f"{len(pays_out)} actual payments | "
          f"skipped: {skipped['unknown_member']} unknown-member, "
          f"{skipped['no_date']} dateless, "
          f"{skipped['schedule_only']} schedule-only rows")
    if not args.apply:
        print("dry-run only (no writes). Re-run with --apply to execute.")
        return

    client = get_client()

    # Members (match by lower(name)).
    have_members = {str(r["name"]).strip().lower(): r["member_id"]
                    for r in fetch_all(client, "member", "member_id,name")}
    max_mid = max(have_members.values() or [0])
    to_members = []
    for m in members:
        key = m["name"].strip().lower()
        if key not in have_members:
            max_mid += 1
            have_members[key] = max_mid
            to_members.append(dict(member_id=max_mid, name=m["name"],
                                   date_joined=m["date_joined"]))
    for i in range(0, len(to_members), 500):
        client.table("member").insert(to_members[i:i + 500]).execute()
    print(f"members inserted: {len(to_members)}")

    # Loans (match by member+amount+date+term; amounts rounded both sides).
    have_loans = {}
    for r in fetch_all(client, "loan",
                       "loan_id,member_id,amount,date_issued,term_months"):
        try:
            have_loans[(int(r["member_id"]), round(float(r["amount"]), 2),
                        str(r["date_issued"]),
                        int(r["term_months"]) if r["term_months"] is not None
                        else None)] = r["loan_id"]
        except (TypeError, ValueError):
            continue
    max_lid = max(have_loans.values() or [0])
    sig_by_key = {}
    to_loans = []
    for lo in loans_out:
        mid = have_members[lo["member_name"].strip().lower()]
        sig = (mid, round(float(lo["amount"]), 2), lo["date_issued"],
               lo["term_months"])
        sig_by_key[lo["_key"]] = sig
        if sig not in have_loans:
            max_lid += 1
            have_loans[sig] = max_lid
            to_loans.append(dict(
                loan_id=max_lid, member_id=mid, amount=lo["amount"],
                interest_rate=lo["interest_rate"], date_issued=lo["date_issued"],
                due_date=lo["due_date"], status=lo["status"],
                term_months=lo["term_months"], loan_type=lo["loan_type"]))
    for i in range(0, len(to_loans), 500):
        client.table("loan").insert(to_loans[i:i + 500]).execute()
    print(f"loans inserted: {len(to_loans)}")

    # Payments (match by loan+installment; schedule-only rows never planned).
    have_pays = {(r["loan_id"], r["installment_no"])
                 for r in fetch_all(client, "payment",
                                    "payment_id,loan_id,installment_no")}
    max_pid = 0
    for r in fetch_all(client, "payment", "payment_id"):
        try:
            max_pid = max(max_pid, int(r["payment_id"]))
        except (TypeError, ValueError):
            pass
    to_pays = []
    for p in pays_out:
        lid = have_loans[sig_by_key[p["_key"]]]
        psig = (lid, p["installment_no"])
        if psig not in have_pays:
            max_pid += 1
            have_pays.add(psig)
            to_pays.append(dict(
                payment_id=max_pid, loan_id=lid,
                installment_no=p["installment_no"],
                expected_amount=p["expected_amount"], amount=p["amount"],
                date=p["date"], status=p["status"]))
    for i in range(0, len(to_pays), 500):
        client.table("payment").insert(to_pays[i:i + 500]).execute()
    print(f"payments inserted: {len(to_pays)}")
    print("seed complete.")


if __name__ == "__main__":
    main()
