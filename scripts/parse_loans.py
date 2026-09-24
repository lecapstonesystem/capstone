"""Parse sample-consultation.xlsx into a clean loans table.

Each sheet holds stacked loan amortization blocks. Each block is anchored by
a "Member's Name:" cell. Layout (columns shift when a loan-type cell is present):

  Row r:   [Member's Name:] [member name] [(optional loan type)] [Loan Amount:] [amount]
  Row r+1: [Membership Number:] ... [Date:] [date]
  Row r+2: [No. of Loan's Made:] ... [Interest Rate:] [rate]
  Row r+3: [Mode of Payment:] ... [No. of Months to Pay:] [term]

Some sheets hold two blocks side-by-side (cols A-I and K-T); some side-by-side
blocks are exact duplicates, others are distinct loans. We parse every anchor
and de-duplicate afterwards.
"""
from __future__ import annotations

import re
from pathlib import Path

import openpyxl
import pandas as pd

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "sample-consultation.xlsx"
OUT_PATH = Path(__file__).resolve().parents[1] / "data" / "loans_clean.csv"
STATS_PATH = Path(__file__).resolve().parents[1] / "data" / "payment_stats.csv"
MERGED_PATH = Path(__file__).resolve().parents[1] / "data" / "loans_with_stats.csv"


KNOWN_LABELS = ["member's name", "membership number", "loan amount", "interest rate",
                "months to pay", "mode of payment", "payment's made", "date:",
                "receipt number", "no. of loan"]


def is_label(text: object) -> bool:
    return isinstance(text, str) and any(k in text.lower() for k in KNOWN_LABELS)


def normalize_loan_type(cell_value: str | None) -> str:
    if not cell_value or not isinstance(cell_value, str):
        return "N/A"
    v = cell_value.strip()
    if re.search(r"emergency", v, re.IGNORECASE) or v.upper() in {"(EL)", "EL"}:
        return "Emergency Loan"
    return "N/A"  # spec: N/A if none stated; only Emergency appears in this file


def next_non_none(row: tuple, start: int, stop: int | None = None):
    """First non-None cell in row[start:stop]. Returns (index, value) or (None, None)."""
    stop = len(row) if stop is None else min(stop, len(row))
    for j in range(start, stop):
        if row[j] is not None and (not isinstance(row[j], str) or row[j].strip() != ""):
            return j, row[j]
    return None, None


def find_label_in_block(row: tuple, label_sub: str, c: int, width: int = 10):
    """Column index of first cell in row[c:c+width] containing label_sub, else None."""
    for j in range(c, min(len(row), c + width)):
        v = row[j]
        if isinstance(v, str) and label_sub.lower() in v.lower():
            return j
    return None


def first_number_after(row: tuple, label_col: int, lookahead: int = 6):
    for j in range(label_col + 1, min(len(row), label_col + 1 + lookahead)):
        v = row[j]
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            return v
    return None


def first_value_after(row: tuple, label_col: int, lookahead: int = 4):
    for j in range(label_col + 1, min(len(row), label_col + 1 + lookahead)):
        v = row[j]
        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            continue
        # skip if it is another known label (cross-block leakage guard)
        if isinstance(v, str) and any(
            k in v.lower() for k in ["member's name", "membership number", "loan amount", "interest rate", "months to pay", "mode of payment", "payment's made"]
        ):
            continue
        return v
    return None


def parse_workbook(path: Path = DATA_PATH) -> pd.DataFrame:
    wb = openpyxl.load_workbook(path, data_only=True)
    records = []

    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        for r, row in enumerate(rows):
            if row is None:
                continue
            for c, val in enumerate(row):
                if not (isinstance(val, str) and val.strip().lower() == "member's name:"):
                    continue
                # --- Row r: member name, optional type, Loan Amount ---
                amt_label = None
                for j in range(c + 1, min(len(row), c + 8)):
                    v = row[j]
                    if isinstance(v, str) and "loan amount" in v.lower():
                        amt_label = j
                        break
                _, member = next_non_none(row, c + 1, amt_label)
                member = str(member).strip() if member is not None else None
                if not member or is_label(member):
                    member = "Unknown"

                loan_type_raw = None
                if amt_label is not None:
                    for j in range(c + 1, amt_label):
                        v = row[j]
                        if isinstance(v, str) and j != c and v.strip() not in (member,):
                            # candidate: anything that is not the member name itself
                            if "loan" in v.lower() or v.strip().upper() in {"(EL)", "EL", "(EMERGENCY LOAN)"}:
                                loan_type_raw = v
                loan_type = normalize_loan_type(loan_type_raw)

                amount = None
                if amt_label is not None:
                    _, amount = next_non_none(row, amt_label + 1, amt_label + 4)
                try:
                    amount = float(amount) if amount is not None else None
                except (TypeError, ValueError):
                    amount = None

                # Skip malformed anchors with no amount (the real loan, if any,
                # is recovered by the fallback pass below).
                if amount is None:
                    continue

                # --- Rows r+1..r+3: date, interest, term (block-local, sparse columns) ---
                date_val, rate, term = None, None, None
                for rr in rows[r + 1: r + 5]:
                    if rr is None:
                        continue
                    dcol = find_label_in_block(rr, "date", c)
                    # guard: skip the amortization header row ("Date of Payment")
                    if dcol is not None and isinstance(rr[dcol], str) and "date of payment" in rr[dcol].lower():
                        dcol = None
                    if dcol is not None and date_val is None:
                        date_val = first_value_after(rr, dcol)
                    icol = find_label_in_block(rr, "interest rate", c)
                    if icol is not None and rate is None:
                        iv = first_number_after(rr, icol)
                        if iv is not None:
                            rate = float(iv)
                    tcol = find_label_in_block(rr, "months to pay", c)
                    if tcol is not None and term is None:
                        tv = first_number_after(rr, tcol)
                        if tv is not None:
                            term = int(tv)

                records.append({
                    "sheet": ws.title,
                    "member": member,
                    "loan_type": loan_type,
                    "loan_amount": amount,
                    "term_months": term,
                    "date_raw": date_val,
                    "interest_rate": rate,
                })

        # Fallback: "Loan Amount:" rows with no "Member's Name:" anchor in the same
        # row (malformed blocks, e.g. 'twenty five-12' row 24). Skip payment rows.
        for r, row in enumerate(rows):
            if row is None:
                continue
            cells = [v for v in row if isinstance(v, str)]
            if any("member's name" in v.lower() for v in cells):
                continue  # handled by main pass
            if any("payment" in v.lower() for v in cells):
                continue  # amortization schedule row, not a loan header
            amt_label = None
            for j, v in enumerate(row):
                if isinstance(v, str) and "loan amount" in v.lower():
                    amt_label = j
                    break
            if amt_label is None:
                continue
            _, amount = next_non_none(row, amt_label + 1, amt_label + 4)
            try:
                amount = float(amount) if amount is not None else None
            except (TypeError, ValueError):
                amount = None
            if amount is None:
                continue
            member = "Unknown"
            for j in range(0, amt_label):
                v = row[j]
                if isinstance(v, str) and v.strip() and not is_label(v):
                    member = v.strip()
                    break
            date_val, rate, term = None, None, None
            for rr in rows[r + 1: r + 5]:
                if rr is None:
                    continue
                for j, v in enumerate(rr):
                    if not isinstance(v, str):
                        continue
                    lv = v.lower()
                    if "date of payment" in lv or "payment" in lv:
                        continue
                    if "date" in lv and date_val is None:
                        date_val = first_value_after(rr, j)
                    if "interest rate" in lv and rate is None:
                        iv = first_number_after(rr, j)
                        if iv is not None:
                            rate = float(iv)
                    if "months to pay" in lv and term is None:
                        tv = first_number_after(rr, j)
                        if tv is not None:
                            term = int(tv)
            records.append({
                "sheet": ws.title,
                "member": member,
                "loan_type": "N/A",
                "loan_amount": amount,
                "term_months": term,
                "date_raw": date_val,
                "interest_rate": rate,
            })

    df = pd.DataFrame(records)
    # Parse dates (mixed m/d/yy, m/d/yyyy, blanks)
    df["date"] = pd.to_datetime(df["date_raw"], errors="coerce")
    # Canonical key (see make_loan_key): dedupes side-by-side copies even when
    # the two copies spell the member/date slightly differently.
    df["loan_key"] = [
        make_loan_key(s, m, a, t, d)
        for s, m, a, t, d in zip(df["sheet"], df["member"],
                                 df["loan_amount"], df["term_months"], df["date_raw"])
    ]
    n0 = len(df)
    df = df.drop_duplicates(subset=["loan_key"]).reset_index(drop=True)
    print(f"Deduped {n0} -> {len(df)} loan blocks")
    return df


def make_loan_key(sheet, member, amount, term_months, date_raw) -> str:
    """Canonical loan identity. MUST stay in sync with parse_payments.py.

    Why this exists: the old dedup key used the raw `date_raw` cell, but
    openpyxl returns that cell as a datetime in one copy, a string like
    "3/2/23" in the other, or None when blank — so identical loans got
    different keys and matching silently failed. This normalizes all four
    parts (sheet | member | amount | term | date) to plain strings.
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


KEY_COLS = ["sheet", "member", "loan_amount", "term_months", "date_raw"]


def ensure_loan_keys(df: pd.DataFrame) -> pd.DataFrame:
    """Add (or repair) the canonical `loan_key` column.

    The key is always RECOMPUTED from the raw columns with make_loan_key —
    never trusted from a stored file — so loans_clean.csv and
    payment_stats.csv join correctly even when the two parsers saw the date
    cell differently (datetime vs "3/2/23" vs blank). Same normalizer on
    both sides => same key. A computed key is never NaN, which also fixes
    the silent row loss that groupby/merge inflict on NaN keys.
    """
    df = df.copy()
    # Case 1 — no usable key yet: build one from the raw columns.
    # Recomputing (not trusting any stored key) is the whole trick: both
    # CSVs pass through the SAME make_loan_key normalizer, so a datetime
    # on one side and "3/2/23" on the other collapse to one identical key.
    if "loan_key" not in df.columns or df["loan_key"].isna().any():
        missing = [c for c in KEY_COLS if c not in df.columns]
        if missing:
            raise KeyError(f"cannot build loan_key, missing columns: {missing}")
        df["loan_key"] = [
            make_loan_key(s, m, a, t, d)
            for s, m, a, t, d in zip(df["sheet"], df["member"],
                                     df["loan_amount"], df["term_months"], df["date_raw"])
        ]
    else:
        # Case 2 — key already present and complete: just force plain str
        # so the later merge never compares str against float/NaN.
        df["loan_key"] = df["loan_key"].astype(str)
    return df


def match_payment_stats(loans: pd.DataFrame, stats: pd.DataFrame, show: int = 15):
    """Left-join per-loan payment stats onto the loans table via `loan_key`.

    Returns (merged, report). Prints coverage so missing matches stay
    visible instead of vanishing silently (the old bug).
    """
    loans = ensure_loan_keys(loans)
    stats = ensure_loan_keys(stats)
    # Two raw stats groups can canonicalize to ONE key (e.g. the date cell
    # was a datetime in one copy, a string in the other). Collapse them so
    # the merge below stays one-to-one instead of duplicating loan rows.
    dup = int(stats.duplicated(subset=["loan_key"]).sum())
    if dup:
        print(f"  note: {dup} stats group(s) collapsed onto one loan_key — keeping first")
        stats = stats.drop_duplicates(subset=["loan_key"])
    # LEFT join: every loan survives even with no stats (stats cols => NaN).
    # suffixes=("", "_stats") keeps loan-side names (sheet, member, ...)
    # untouched and renames only the colliding stats-side copies.
    merged = loans.merge(stats, on="loan_key", how="left",
                         suffixes=("", "_stats"))
    # Set arithmetic on the key sets is the coverage report: anything in
    # exactly one set is a "missing match" the old code dropped silently.
    lk, sk = set(loans["loan_key"]), set(stats["loan_key"])
    report = {
        "n_loans": len(loans),
        "n_stats_groups": len(stats),
        "matched": len(lk & sk),
        "loans_without_schedules": sorted(lk - sk),
        "stats_without_loan": sorted(sk - lk),
    }
    print(f"\nKey match: {report['matched']}/{report['n_loans']} loans own schedule rows; "
          f"{len(report['loans_without_schedules'])} without; "
          f"{len(report['stats_without_loan'])} stats groups without a loan")
    if report["loans_without_schedules"][:show]:
        print("  loans without schedules:")
        print("   " + "\n   ".join(report["loans_without_schedules"][:show]))
    if report["stats_without_loan"][:show]:
        print("  stats groups without a loan (parser divergence — investigate):")
        print("   " + "\n   ".join(report["stats_without_loan"][:show]))
    return merged, report


def main() -> None:
    df = parse_workbook()
    df.to_csv(OUT_PATH, index=False)
    print(f"Wrote {len(df)} loans -> {OUT_PATH}")
    print(df.head(10).to_string())
    print("\nTerm distribution:")
    print(df["term_months"].value_counts().sort_index().to_string())
    print("\nLoan-type distribution:")
    print(df["loan_type"].value_counts().to_string())
    print(f"\nAmounts: n={df['loan_amount'].notna().sum()} "
          f"total={df['loan_amount'].sum():,.0f} mean={df['loan_amount'].mean():,.0f}")
    if STATS_PATH.exists():
        stats = pd.read_csv(STATS_PATH, keep_default_na=False)
        merged, _ = match_payment_stats(df, stats)
        merged.to_csv(MERGED_PATH, index=False)
        print(f"Wrote {len(merged)} matched rows -> {MERGED_PATH}")
    else:
        print(f"\nSkipping key-match check ({STATS_PATH.name} not found — "
              f"run parse_payments.py first)")


if __name__ == "__main__":
    main()
