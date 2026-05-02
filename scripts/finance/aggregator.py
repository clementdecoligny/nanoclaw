#!/usr/bin/env python3
"""
aggregator.py — Monthly expense aggregation and trend analysis

Takes a categorized transactions JSON (from categorizer.py) and produces
a summary with totals by category, month-over-month deltas, and anomaly flags.

Usage:
  python3 aggregator.py categorized.json \
    --compare-history /path/to/historical/ \
    --output summary-YYYY-MM.json \
    [--year YYYY --month MM]
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path


# ---------------------------------------------------------------------------
# Core aggregation — all arithmetic via Python, never model-computed
# ---------------------------------------------------------------------------

def aggregate_by_category(transactions: list[dict]) -> dict[str, float]:
    """Sum transaction amounts (expenses only, negative → positive) by category."""
    totals: dict[str, float] = defaultdict(float)
    for t in transactions:
        amount = t.get("amount", 0.0)
        if amount < 0:  # expenses only
            category = t.get("category", "Outros")
            totals[category] = round(totals[category] + abs(amount), 2)
    return dict(sorted(totals.items(), key=lambda x: x[1], reverse=True))


def top_transactions(transactions: list[dict], n: int = 5) -> list[dict]:
    """Return the N largest individual expenses."""
    expenses = [t for t in transactions if t.get("amount", 0) < 0]
    expenses.sort(key=lambda t: t["amount"])  # most negative first
    return expenses[:n]


def load_historical_averages(history_dir: Path) -> dict[str, float]:
    """
    Compute 12-month rolling average per category from historical summary files.
    Files are named summary-YYYY-MM.json in history_dir.
    """
    averages: dict[str, list[float]] = defaultdict(list)

    for f in sorted(history_dir.glob("summary-*.json"))[-12:]:
        try:
            data = json.loads(f.read_text())
            for cat, total in data.get("by_category", {}).items():
                averages[cat].append(total)
        except (json.JSONDecodeError, KeyError):
            continue

    return {
        cat: round(sum(vals) / len(vals), 2)
        for cat, vals in averages.items()
        if vals
    }


def compute_deltas(
    current: dict[str, float],
    previous: dict[str, float],
) -> dict[str, dict]:
    """Return delta and % change for each category vs. previous month."""
    all_cats = set(current) | set(previous)
    deltas = {}
    for cat in all_cats:
        curr = current.get(cat, 0.0)
        prev = previous.get(cat, 0.0)
        delta = round(curr - prev, 2)
        pct = round((delta / prev * 100), 1) if prev else None
        deltas[cat] = {"delta": delta, "pct_change": pct}
    return deltas


def flag_anomalies(
    current: dict[str, float],
    averages: dict[str, float],
    threshold: float = 1.3,
) -> list[dict]:
    """Flag categories where current spend > threshold × rolling average."""
    anomalies = []
    for cat, total in current.items():
        avg = averages.get(cat)
        if avg and total > avg * threshold:
            anomalies.append({
                "category": cat,
                "current": total,
                "rolling_avg": avg,
                "ratio": round(total / avg, 2),
            })
    return sorted(anomalies, key=lambda x: x["ratio"], reverse=True)


def build_summary(
    transactions: list[dict],
    history_dir: Path,
    year: int,
    month: int,
) -> dict:
    """Build the full monthly summary dict."""
    by_category = aggregate_by_category(transactions)
    top5 = [
        {
            "date": t.get("posting_date"),
            "description": t.get("description"),
            "amount": abs(t.get("amount", 0)),
            "category": t.get("category", "Outros"),
        }
        for t in top_transactions(transactions, 5)
    ]

    # Load previous month for delta
    prev_summary_file = history_dir / f"summary-{year}-{month - 1:02d}.json"
    if month == 1:
        prev_summary_file = history_dir / f"summary-{year - 1}-12.json"

    previous_by_category: dict[str, float] = {}
    if prev_summary_file.exists():
        try:
            previous_by_category = json.loads(prev_summary_file.read_text()).get("by_category", {})
        except json.JSONDecodeError:
            pass

    averages = load_historical_averages(history_dir)
    deltas = compute_deltas(by_category, previous_by_category)
    anomalies = flag_anomalies(by_category, averages)

    total_expenses = round(sum(by_category.values()), 2)
    personal = round(sum(abs(t["amount"]) for t in transactions if t.get("amount", 0) < 0 and t.get("account") == "personal"), 2)
    joint = round(sum(abs(t["amount"]) for t in transactions if t.get("amount", 0) < 0 and t.get("account") == "joint"), 2)

    return {
        "year": year,
        "month": month,
        "total_expenses": total_expenses,
        "personal_total": personal,
        "joint_total": joint,
        "by_category": by_category,
        "top_expenses": top5,
        "vs_previous_month": deltas,
        "rolling_averages": averages,
        "anomalies": anomalies,
        "transaction_count": len(transactions),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse
    from datetime import date

    parser = argparse.ArgumentParser(description="Aggregate categorized transactions into monthly summary")
    parser.add_argument("categorized_json", help="Path to categorized transactions JSON")
    parser.add_argument("--compare-history", required=True, help="Path to historical summaries dir")
    parser.add_argument("--output", required=True, help="Output path for summary JSON")
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument("--month", type=int, default=date.today().month)
    args = parser.parse_args()

    transactions = json.loads(Path(args.categorized_json).read_text())
    history_dir = Path(args.compare_history)

    summary = build_summary(transactions, history_dir, args.year, args.month)

    Path(args.output).write_text(json.dumps(summary, ensure_ascii=False, indent=2))

    print(f"Summary for {args.year}-{args.month:02d}:")
    print(f"  Total expenses: €{summary['total_expenses']:.2f}")
    print(f"  Categories: {len(summary['by_category'])}")
    print(f"  Anomalies: {len(summary['anomalies'])}")
    if summary["anomalies"]:
        for a in summary["anomalies"]:
            print(f"    ⚠ {a['category']}: €{a['current']:.2f} ({a['ratio']}× avg)")


if __name__ == "__main__":
    main()
