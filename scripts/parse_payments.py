"""Parse amortization *schedule* rows (payment records) from sample-consultation.xlsx.

Each loan block is followed by schedule rows:
  [1st Payment:] [Present Capital] [Deducted] [Interest] [Amount to be Paid]
                 [Paid Amount] [Date of Payment] [Receipt Number] [REMARKS incl. Fully Paid]

Outputs:
  data/payments.csv       one row per installment per loan (deduped across
                          side-by-side copies)
  data/payment_stats.csv  one row per loan: expected vs actually paid,
                          collection rate, fully-paid flag, payment-date count

Key finding this quantifies: the sample file is mostly loan-issue records +
schedules; actual payment cells (Paid Amount / Date of Payment) are sparse.
"""
from __future__ import annotations

import re
from pathlib import Path

import matplotlib
import numpy as np
import openpyxl
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

BASE = Path(__file__).resolve().parents[1]
DATA_PATH = BASE / "data" / "sample-consultation.xlsx"
PAY_OUT = BASE / "data" / "payments.csv"
STAT_OUT = BASE / "data" / "payment_stats.csv"
OUT = BASE / "outputs"

INST_RE = re.compile(r"(\d+)\s*(st|nd|rd|th)", re.IGNORECASE)


def half_of(col: int, ncols: int) -> int:
    """Left (0) or right (1) side-by-side block region (blocks are ~10 cols wide)."""
    return 1 if ncols > 10 and col >= 10 else 0


def parse_payments(path: Path = DATA_PATH) -> pd.DataFrame:
    wb = openpyxl.load_workbook(path, data_only=True)
    rows_out = []

    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        ncols = ws.max_column
        cur_loan = {}   # half -> dict(member, amount, date_raw, term)
        colmap = {}     # half -> dict(exp, paid, date)

        for r, row in enumerate(rows):
            if row is None:
                continue
            low = [v.lower() if isinstance(v, str) else "" for v in row]

            # --- loan anchor: (re)starts current loan for its half ---
            for c, v in enumerate(row):
                if isinstance(v, str) and v.strip().lower() == "member's name:":
                    h = half_of(c, ncols)
                    # member: first non-empty cell right of anchor (skip labels)
                    member = "Unknown"
                    for j in range(c + 1, min(len(row), c + 8)):
                        w = row[j]
                        if w is None or (isinstance(w, str) and not w.strip()):
                            continue
                        if isinstance(w, str) and "loan amount" in w.lower():
                            break
                        member = str(w).strip()
                        break
                    # amount after "Loan Amount:" label
                    amount = None
                    for j in range(c + 1, min(len(row), c + 8)):
                        w = row[j]
                        if isinstance(w, str) and "loan amount" in w.lower():
                            for k in range(j + 1, min(len(row), j + 4)):
                                if isinstance(row[k], (int, float)):
                                    amount = float(row[k])
                                    break
                            break
                    # term: nearest "months to pay" below, same half
                    term = None
                    for rr in rows[r + 1: r + 5]:
                        if rr is None:
                            continue
                        for j, w in enumerate(rr):
                            if half_of(j, ncols) != h:
                                continue
                            if isinstance(w, str) and "months to pay" in w.lower():
                                for k in range(j + 1, min(len(rr), j + 7)):
                                    if isinstance(rr[k], (int, float)):
                                        term = int(rr[k])
                                        break
                                if term is not None:
                                    break
                        if term is not None:
                            break
                    # date: nearest "date" label below, same half (skip Date of Payment)
                    date_raw = None
                    for rr in rows[r + 1: r + 5]:
                        if rr is None:
                            continue
                        for j, w in enumerate(rr):
                            if half_of(j, ncols) != h:
                                continue
                            if isinstance(w, str) and "date" in w.lower() and "date of payment" not in w.lower():
                                for k in range(j + 1, min(len(rr), j + 4)):
                                    u = rr[k]
                                    if u is None or (isinstance(u, str) and not u.strip()):
                                        continue
                                    if isinstance(u, str) and "member" in u.lower():
                                        continue
                                    date_raw = u
                                    break
                                if date_raw is not None:
                                    break
                        if date_raw is not None:
                            break
                    if amount is not None:
                        cur_loan[h] = {"member": member, "amount": amount,
                                       "date_raw": date_raw, "term": term}

            # --- schedule header: learn column positions per half ---
            if any("payment's made" in c for c in low):
                for c, v in enumerate(row):
                    if isinstance(v, str) and "payment's made" in v.lower():
                        h = half_of(c, ncols)
                        m = {"exp": None, "paid": None, "date": None}
                        for j in range(c, min(len(row), c + 10)):
                            w = row[j]
                            if not isinstance(w, str):
                                continue
                            lw = w.lower()
                            if "amount to be paid" in lw:
                                m["exp"] = j
                            elif "paid amount" in lw:
                                m["paid"] = j
                            elif "date of payment" in lw:
                                m["date"] = j
                        colmap[h] = m
                continue

            # --- schedule row: installment label in either half ---
            for c, v in enumerate(row):
                if not (isinstance(v, str) and INST_RE.search(v)):
                    continue
                h = half_of(c, ncols)
                if h not in cur_loan or h not in colmap:
                    continue
                mnum = int(INST_RE.search(v).group(1))
                sl = list(row[c: c + 10]) + [None] * 10
                sl = sl[:10]
                fully = any(isinstance(x, str) and "fully paid" in x.lower() for x in sl)

                def cell(idx):
                    if idx is None or idx - c < 0 or idx - c >= len(sl):
                        return None
                    return sl[idx - c]

                exp = cell(colmap[h]["exp"])
                exp = float(exp) if isinstance(exp, (int, float)) else None
                praw = cell(colmap[h]["paid"])
                paid = float(praw) if isinstance(praw, (int, float)) else None
                draw = cell(colmap[h]["date"])
                if isinstance(draw, str) and not draw.strip():
                    draw = None
                loan = cur_loan[h]
                rows_out.append({
                    "sheet": ws.title,
                    "member": loan["member"],
                    "loan_amount": loan["amount"],
                    "term_months": loan["term"],
                    "date_raw": loan["date_raw"],
                    "installment": mnum,
                    "expected": exp,
                    "paid": paid,
                    "date_paid_raw": draw,
                    "fully_paid_mark": fully,
                })

    df = pd.DataFrame(rows_out)
    if df.empty:
        return df
    df["date_paid"] = pd.to_datetime(df["date_paid_raw"], errors="coerce")
    df["member_norm"] = df["member"].astype(str).str.strip().str.lower()
    # Side-by-side copies sometimes differ in layout (e.g. right copy lacks the
    # Paid Amount column), so dedupe on the installment key keeping the row
    # that carries actual payment data.
    df["_has_paid"] = df["paid"].notna().astype(int)
    df["_has_date"] = df["date_paid"].notna().astype(int)
    df = df.sort_values(["_has_paid", "_has_date"], ascending=False)
    df = df.drop_duplicates(subset=["sheet", "member_norm", "loan_amount", "date_raw",
                                    "term_months", "installment"])
    return df.drop(columns=["member_norm", "_has_paid", "_has_date"]).reset_index(drop=True)


def per_loan_stats(pay: pd.DataFrame) -> pd.DataFrame:
    p = pay.copy()
    p["date_raw"] = p["date_raw"].fillna("").astype(str)
    # dropna=False: groupby otherwise silently drops rows with NaN keys
    # (e.g. loans whose Date: cell was blank)
    g = p.groupby(["sheet", "member", "loan_amount", "term_months", "date_raw"],
                  dropna=False)
    s = g.agg(
        n_installments=("installment", "max"),
        n_rows=("installment", "size"),
        total_expected=("expected", "sum"),
        total_paid=("paid", "sum"),
        n_paid_rows=("paid", lambda x: x.notna().sum()),
        n_dates=("date_paid", lambda x: x.notna().sum()),
        fully_paid=("fully_paid_mark", "max"),
    ).reset_index()
    s["total_paid"] = s["total_paid"].fillna(0)
    s["collection_rate"] = (s["total_paid"] / s["total_expected"].replace(0, np.nan)).fillna(0)
    s["paid_row_ratio"] = s["n_paid_rows"] / s["n_installments"].replace(0, np.nan)
    return s


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pay = parse_payments()
    pay.to_csv(PAY_OUT, index=False)
    stats = per_loan_stats(pay)
    stats.to_csv(STAT_OUT, index=False)

    print(f"Installment rows (deduped): {len(pay)}")
    print(f"Loans with schedules: {len(stats)}")
    print(f"Rows with Paid Amount: {int(pay['paid'].notna().sum())} | "
          f"with Date of Payment: {int(pay['date_paid'].notna().sum())} | "
          f"Fully Paid marks: {int(pay['fully_paid_mark'].sum())}")
    print(f"\nOverall collection efficiency = paid/expected = "
          f"{pay['paid'].fillna(0).sum():,.0f} / {pay['expected'].fillna(0).sum():,.0f} = "
          f"{pay['paid'].fillna(0).sum() / max(pay['expected'].fillna(0).sum(), 1):.3f}")
    print(f"Loans flagged Fully Paid: {int(stats['fully_paid'].sum())}/{len(stats)}")
    print("\nFully-paid share by term:")
    print((stats.groupby("term_months")["fully_paid"].mean().sort_index().to_string()))
    print("\nMean collection rate by term:")
    print((stats.groupby("term_months")["collection_rate"].mean().sort_index().to_string()))

    # bars: fully-paid share + collection rate by term
    fp = stats.groupby("term_months")["fully_paid"].mean().sort_index()
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.bar(fp.index.astype(str), fp.values, color="#2E8B57")
    ax.set_title("Fully-paid share of loans by term (from REMARKS flags)")
    ax.set_xlabel("Term (months)"); ax.set_ylabel("Share fully paid")
    ax.set_ylim(0, 1.05)
    fig.tight_layout(); fig.savefig(OUT / "bar_fully_paid_rate_by_term.png"); plt.close(fig)

    cr = stats.groupby("term_months")["collection_rate"].mean().sort_index()
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.bar(cr.index.astype(str), cr.values, color="#4472C4")
    ax.set_title("Mean collection rate (paid / expected) by term — sparse actuals, interpret with care")
    ax.set_xlabel("Term (months)"); ax.set_ylabel("Collection rate")
    ax.set_ylim(0, max(1.05, float(cr.max()) if len(cr) else 1.05))
    fig.tight_layout(); fig.savefig(OUT / "bar_collection_rate_by_term.png"); plt.close(fig)
    print("\nSaved: bar_fully_paid_rate_by_term.png, bar_collection_rate_by_term.png")


if __name__ == "__main__":
    main()
