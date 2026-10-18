"""Loan amortization for the UCMS portal.

Diminishing balance, which is how the cooperative builds its manual schedule:
the principal part is level every month and interest is charged on whatever is
still owed. rate_percent is the monthly rate - 1.5% for most loans, 2% for
business - not an annual one.

Mirrors web/src/utils/amortization.js so both sides show the same figures.
"""

import calendar
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

TYPE_RATES = {
    "Regular": 1.5,
    "Education": 1.5,
    "Transportation": 1.5,
    "Gadget": 1.5,
    "Business": 2.0,
    "Emergency": 1.5,
}

DEFAULT_RATE = 1.5


def round2(value) -> float:
    """Two decimals, half up. Python's round() goes half-to-even, which is
    the wrong way round for money."""
    try:
        return float(Decimal(str(float(value))).quantize(Decimal("0.01"), ROUND_HALF_UP))
    except (TypeError, ValueError):
        return 0.0


def number(value) -> float:
    """Blank cells come out of the CSVs, so coerce rather than raise."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def rate_for_type(loan_type) -> float:
    return TYPE_RATES.get((loan_type or "").strip().title(), DEFAULT_RATE)


def loan_totals(principal, rate_percent, term_months) -> dict:
    """Principal is level, so the monthly balances run p, p-p/n, p-2p/n ...
    and sum to p*(n+1)/2 - which gives the interest total in one line."""
    p = number(principal)
    n = int(number(term_months))
    if p <= 0 or n <= 0:
        return {
            "principal_part": 0.0,
            "first_payment": 0.0,
            "last_payment": 0.0,
            "interest_total": 0.0,
            "total_due": 0.0,
        }

    rate = number(rate_percent) / 100
    part = p / n
    interest = rate * p * (n + 1) / 2
    return {
        "principal_part": round2(part),
        "first_payment": round2(part + p * rate),
        "last_payment": round2(part + part * rate),
        "interest_total": round2(interest),
        "total_due": round2(p + interest),
    }


def add_months(when, months: int):
    """Clamp to the end of the target month. A plain day offset would send
    31 January to 3 March."""
    year = when.year + (when.month - 1 + months) // 12
    month = (when.month - 1 + months) % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return when.replace(year=year, month=month, day=min(when.day, last))


def build_schedule(principal, rate_percent, term_months, start=None) -> list[dict]:
    """Month-by-month schedule. Due dates run from `start`, which is the
    release date for live loans and the application date for pending ones."""
    p = number(principal)
    n = int(number(term_months))
    if p <= 0 or n <= 0:
        return []

    if start is None:
        start = datetime.now(timezone.utc)
    elif isinstance(start, datetime):
        pass
    elif isinstance(start, date):
        start = datetime(start.year, start.month, start.day)
    else:
        start = datetime.fromisoformat(str(start))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    rate = number(rate_percent) / 100
    part = p / n
    rows = []
    balance = p

    for month in range(1, n + 1):
        interest = balance * rate
        due = add_months(start, month).astimezone(timezone.utc)
        rows.append(
            {
                "month": month,
                "due_date": due.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                # the last month clears what's left, so drift can't strand a balance
                "principal": round2(balance) if month == n else round2(part),
                "interest": round2(interest),
                "payment": round2(part + interest),
                "balance": round2(max(0.0, balance - part)),
            }
        )
        balance -= part

    return rows


def next_due(rows, paid) -> dict | None:
    """First instalment the payments haven't covered yet."""
    cumulative = 0.0
    for row in rows:
        cumulative += row["payment"]
        if number(paid) < cumulative - 0.01:
            return row
    return None


def simulate_loan(
    principal,
    term_months,
    rate_percent=None,
    loan_type=None,
    start=None,
    payments=(),
) -> dict:
    """Everything the portal needs about one loan, ready to return as JSON.

    Give rate_percent directly, or pass loan_type and let TYPE_RATES pick it.
    payments are the amounts received so far, oldest first.
    """
    rate = number(rate_percent) if rate_percent is not None else rate_for_type(loan_type)
    totals = loan_totals(principal, rate, term_months)
    rows = build_schedule(principal, rate, term_months, start)

    received = [number(p.get("amount", 0) if isinstance(p, dict) else p) for p in payments or ()]
    paid = round2(sum(received))
    due_row = next_due(rows, paid)

    return {
        "principal": round2(principal),
        "rate_percent": rate,
        "term_months": int(number(term_months)),
        "loan_type": loan_type,
        "totals": totals,
        "schedule": rows,
        "paid_total": paid,
        "outstanding": round2(max(0.0, totals["total_due"] - paid)),
        "overpaid": round2(max(0.0, paid - totals["total_due"])),
        "next_due": due_row,
        "fully_paid": bool(rows) and due_row is None,
    }