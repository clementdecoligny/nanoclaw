"""
test_aggregator.py — TDD tests for monthly expense aggregation
"""

import json
import tempfile
from pathlib import Path

import pytest
from aggregator import (
    aggregate_by_category,
    top_transactions,
    compute_deltas,
    flag_anomalies,
    build_summary,
)


SAMPLE_TRANSACTIONS = [
    {"description": "PINGO DOCE", "amount": -45.30, "category": "Supermercado", "account": "personal", "posting_date": "2025-01-05"},
    {"description": "CONTINENTE", "amount": -87.60, "category": "Supermercado", "account": "joint",    "posting_date": "2025-01-10"},
    {"description": "NETFLIX",    "amount": -15.99, "category": "Subscrições",  "account": "personal", "posting_date": "2025-01-01"},
    {"description": "UBER",       "amount": -12.50, "category": "Transportes",  "account": "personal", "posting_date": "2025-01-15"},
    {"description": "SALARY",     "amount": 3500.0, "category": "Rendimento",   "account": "personal", "posting_date": "2025-01-01"},
]


# ---------------------------------------------------------------------------
# aggregate_by_category
# ---------------------------------------------------------------------------

def test_sums_expenses_by_category():
    totals = aggregate_by_category(SAMPLE_TRANSACTIONS)
    assert totals["Supermercado"] == pytest.approx(45.30 + 87.60, abs=0.01)
    assert totals["Subscrições"] == pytest.approx(15.99, abs=0.01)
    assert totals["Transportes"] == pytest.approx(12.50, abs=0.01)


def test_excludes_income_from_totals():
    totals = aggregate_by_category(SAMPLE_TRANSACTIONS)
    assert "Rendimento" not in totals


def test_returns_amounts_as_positive():
    totals = aggregate_by_category(SAMPLE_TRANSACTIONS)
    for cat, total in totals.items():
        assert total >= 0, f"{cat} total should be positive"


def test_sorted_by_total_descending():
    totals = aggregate_by_category(SAMPLE_TRANSACTIONS)
    values = list(totals.values())
    assert values == sorted(values, reverse=True)


# ---------------------------------------------------------------------------
# top_transactions
# ---------------------------------------------------------------------------

def test_returns_n_largest_expenses():
    top = top_transactions(SAMPLE_TRANSACTIONS, n=2)
    assert len(top) == 2
    amounts = [abs(t["amount"]) for t in top]
    assert amounts[0] >= amounts[1]


def test_excludes_income_from_top():
    top = top_transactions(SAMPLE_TRANSACTIONS, n=10)
    for t in top:
        assert t["amount"] < 0


# ---------------------------------------------------------------------------
# compute_deltas
# ---------------------------------------------------------------------------

def test_delta_is_difference():
    current = {"Supermercado": 200.0, "Transporte": 50.0}
    previous = {"Supermercado": 180.0, "Transporte": 60.0}
    deltas = compute_deltas(current, previous)
    assert deltas["Supermercado"]["delta"] == pytest.approx(20.0, abs=0.01)
    assert deltas["Transporte"]["delta"] == pytest.approx(-10.0, abs=0.01)


def test_pct_change_calculation():
    current = {"Supermercado": 200.0}
    previous = {"Supermercado": 160.0}
    deltas = compute_deltas(current, previous)
    assert deltas["Supermercado"]["pct_change"] == pytest.approx(25.0, abs=0.1)


def test_new_category_has_none_pct():
    current = {"Nova Categoria": 50.0}
    previous = {}
    deltas = compute_deltas(current, previous)
    assert deltas["Nova Categoria"]["pct_change"] is None


# ---------------------------------------------------------------------------
# flag_anomalies
# ---------------------------------------------------------------------------

def test_flags_category_above_threshold():
    current = {"Supermercado": 400.0}
    averages = {"Supermercado": 200.0}
    anomalies = flag_anomalies(current, averages, threshold=1.3)
    assert len(anomalies) == 1
    assert anomalies[0]["category"] == "Supermercado"
    assert anomalies[0]["ratio"] == pytest.approx(2.0, abs=0.01)


def test_does_not_flag_normal_spend():
    current = {"Supermercado": 210.0}
    averages = {"Supermercado": 200.0}
    anomalies = flag_anomalies(current, averages, threshold=1.3)
    assert len(anomalies) == 0


# ---------------------------------------------------------------------------
# build_summary
# ---------------------------------------------------------------------------

def test_build_summary_totals(tmp_path):
    summary = build_summary(SAMPLE_TRANSACTIONS, tmp_path, year=2025, month=1)
    assert summary["total_expenses"] == pytest.approx(45.30 + 87.60 + 15.99 + 12.50, abs=0.01)
    assert summary["year"] == 2025
    assert summary["month"] == 1


def test_build_summary_personal_vs_joint(tmp_path):
    summary = build_summary(SAMPLE_TRANSACTIONS, tmp_path, year=2025, month=1)
    assert summary["personal_total"] == pytest.approx(45.30 + 15.99 + 12.50, abs=0.01)
    assert summary["joint_total"] == pytest.approx(87.60, abs=0.01)


def test_build_summary_has_required_keys(tmp_path):
    summary = build_summary(SAMPLE_TRANSACTIONS, tmp_path, year=2025, month=1)
    for key in ["total_expenses", "by_category", "top_expenses", "vs_previous_month", "anomalies"]:
        assert key in summary
