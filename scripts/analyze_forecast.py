"""Starter data-analytics + forecasting system: loan terms (1-36 months), loan types, amounts.

Reads  data/loans_clean.csv  (built by parse_loans.py) and produces:
  - console summaries
  - data/term_summary.csv, data/forecast_by_term.csv, data/monthly_forecast.csv
  - outputs/*.png bar graphs (history + baseline forecasts)

Forecast method (baseline, explainable): monthly disbursement run-rate x term share,
plus a linear-trend projection of monthly totals for the next 6 months.
"""
from __future__ import annotations

from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data" / "loans_clean.csv"
OUT = BASE / "outputs"
FORECAST_MONTHS = 6

plt.rcParams.update({"figure.dpi": 120, "axes.grid": True, "grid.alpha": 0.3})


def load() -> pd.DataFrame:
    # keep_default_na=False so the literal "N/A" loan type survives the round-trip
    df = pd.read_csv(DATA, keep_default_na=False)
    df["loan_amount"] = pd.to_numeric(df["loan_amount"], errors="coerce")
    df["term_months"] = pd.to_numeric(df["term_months"], errors="coerce")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["loan_amount", "term_months"]).copy()
    df["term_months"] = df["term_months"].astype(int)
    return df


def term_summary(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("term_months").agg(
        n_loans=("loan_amount", "size"),
        total_amount=("loan_amount", "sum"),
        avg_amount=("loan_amount", "mean"),
    )
    # show the full 1..36 menu even when a term has zero history
    full = pd.DataFrame({"term_months": range(1, 37)}).set_index("term_months")
    g = full.join(g).fillna({"n_loans": 0, "total_amount": 0.0})
    g["n_loans"] = g["n_loans"].astype(int)
    g["share_of_total"] = g["total_amount"] / g["total_amount"].sum()
    return g.reset_index()


def forecast_by_term(df: pd.DataFrame, summary: pd.DataFrame, months: int = FORECAST_MONTHS) -> pd.DataFrame:
    """Baseline 'futures': monthly run-rate x historical term share."""
    dated = df.dropna(subset=["date"])
    n_hist_months = max(dated["date"].dt.to_period("M").nunique(), 1)
    monthly_run_rate = dated["loan_amount"].sum() / n_hist_months
    hist_share = df.groupby("term_months")["loan_amount"].sum() / df["loan_amount"].sum()
    fc = summary[["term_months", "n_loans", "total_amount"]].copy()
    fc["hist_share"] = fc["term_months"].map(hist_share).fillna(0.0)
    fc[f"forecast_next{months}m_total"] = monthly_run_rate * months * fc["hist_share"]
    # expected loan count per term, assuming avg ticket per term holds
    avg = df.groupby("term_months")["loan_amount"].mean()
    fc["avg_amount"] = fc["term_months"].map(avg)
    fc[f"forecast_next{months}m_count"] = (
        fc[f"forecast_next{months}m_total"] / fc["avg_amount"].replace(0, np.nan)
    ).fillna(0).round(1)
    return fc


def monthly_series_forecast(df: pd.DataFrame, months: int = FORECAST_MONTHS) -> pd.DataFrame:
    dated = df.dropna(subset=["date"]).copy()
    m = dated.groupby(dated["date"].dt.to_period("M")).agg(
        total=("loan_amount", "sum"), n=("loan_amount", "size"))
    m.index = m.index.to_timestamp()
    m = m.asfreq("MS", fill_value=0)
    X = np.arange(len(m)).reshape(-1, 1)
    model = LinearRegression().fit(X, m["total"].values)
    future_idx = pd.date_range(m.index.max() + pd.offsets.MonthBegin(1), periods=months, freq="MS")
    Xf = np.arange(len(m), len(m) + months).reshape(-1, 1)
    pred = np.clip(model.predict(Xf), 0, None)
    hist = m.reset_index().rename(columns={"index": "month", "date": "month"})
    hist["kind"] = "history"
    fut = pd.DataFrame({"month": future_idx, "total": pred, "n": np.nan, "kind": "forecast"})
    return pd.concat([hist, fut], ignore_index=True), float(model.coef_[0])


def bar(ax, x, y, **kw):
    ax.bar(x, y, **kw)
    ax.set_xticks(list(x))
    ax.tick_params(axis="x", rotation=0, labelsize=8)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    df = load()
    summary = term_summary(df)
    fc_term = forecast_by_term(df, summary)
    monthly, slope = monthly_series_forecast(df)

    summary.to_csv(BASE / "data" / "term_summary.csv", index=False)
    fc_term.to_csv(BASE / "data" / "forecast_by_term.csv", index=False)
    monthly.to_csv(BASE / "data" / "monthly_forecast.csv", index=False)

    print(f"Loans analysed: {len(df)} | total={df['loan_amount'].sum():,.0f} "
          f"| mean ticket={df['loan_amount'].mean():,.0f}")
    print("\nTop terms by total disbursed:")
    print(summary.sort_values("total_amount", ascending=False).head(8).to_string(index=False))
    print("\nLoan mix (total amount):")
    print(df.groupby("loan_type")["loan_amount"].agg(["count", "sum"]).to_string())
    print(f"\nMonthly trend slope: {slope:,.0f} pesos/month "
          f"(linear baseline on {monthly[monthly.kind=='history'].shape[0]} months)")
    print(f"\nProjected disbursement next {FORECAST_MONTHS} months: "
          f"{monthly.loc[monthly.kind=='forecast','total'].sum():,.0f}")

    # 1) count per term selection (1..36)
    fig, ax = plt.subplots(figsize=(12, 4.5))
    bar(ax, summary["term_months"], summary["n_loans"], color="#4472C4")
    ax.set_title("Loans disbursed per term selection (1-36 months)")
    ax.set_xlabel("Term (months)"); ax.set_ylabel("Number of loans")
    fig.tight_layout(); fig.savefig(OUT / "bar_count_by_term.png"); plt.close(fig)

    # 2) total pesos per term selection
    fig, ax = plt.subplots(figsize=(12, 4.5))
    bar(ax, summary["term_months"], summary["total_amount"] / 1e3, color="#2E8B57")
    ax.set_title("Total pesos disbursed per term selection (in thousands)")
    ax.set_xlabel("Term (months)"); ax.set_ylabel("Thousand pesos")
    fig.tight_layout(); fig.savefig(OUT / "bar_total_by_term.png"); plt.close(fig)

    # 3) totals by loan type (N/A vs Emergency Loan)
    mix = df.groupby("loan_type")["loan_amount"].sum().sort_values()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.barh(mix.index.astype(str), mix.values, color=["#808080", "#C55A11"])
    ax.set_title("Total disbursed by loan type")
    ax.set_xlabel("Pesos")
    for i, v in enumerate(mix.values):
        ax.text(v, i, f"  {v:,.0f}", va="center")
    fig.tight_layout(); fig.savefig(OUT / "bar_by_loan_type.png"); plt.close(fig)

    # 4) baseline futures per term: forecast pesos next 6 months
    fig, ax = plt.subplots(figsize=(12, 4.5))
    bar(ax, fc_term["term_months"], fc_term[f"forecast_next{FORECAST_MONTHS}m_total"] / 1e3,
        color="#E36C0A")
    ax.set_title(f"Baseline forecast: pesos per term selection, next {FORECAST_MONTHS} months "
                 "(run-rate x term share)")
    ax.set_xlabel("Term (months)"); ax.set_ylabel("Thousand pesos (forecast)")
    fig.tight_layout(); fig.savefig(OUT / "bar_forecast_next6m_by_term.png"); plt.close(fig)

    # 5) monthly history (bars) + trend forecast (orange bars)
    hist = monthly[monthly.kind == "history"].reset_index(drop=True)
    fut = monthly[monthly.kind == "forecast"].reset_index(drop=True)
    nh, nf = len(hist), len(fut)
    xh, xf = np.arange(nh), np.arange(nh, nh + nf)
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.bar(xh, hist["total"] / 1e3, color="#4472C4", label="history")
    ax.bar(xf, fut["total"] / 1e3, color="#E36C0A", label="forecast")
    labels = pd.concat([hist["month"], fut["month"]]).dt.strftime("%Y-%m")
    step = max(1, (nh + nf) // 14)
    ax.set_xticks(range(0, nh + nf, step))
    ax.set_xticklabels(labels.iloc[::step], rotation=30, ha="right", fontsize=8)
    ax.set_title(f"Monthly disbursements with {FORECAST_MONTHS}-month linear-trend forecast (thousands)")
    ax.set_xlabel("Month"); ax.set_ylabel("Thousand pesos")
    ax.legend(); fig.autofmt_xdate(); fig.tight_layout()
    fig.savefig(OUT / "bar_monthly_history_forecast.png"); plt.close(fig)

    print("\nSaved:", *[str(p) for p in sorted(OUT.glob("bar_*.png"))], sep="\n  ")


if __name__ == "__main__":
    main()
