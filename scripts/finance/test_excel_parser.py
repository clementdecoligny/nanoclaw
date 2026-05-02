"""
test_excel_parser.py — TDD tests for ActivoBank Excel export parsing

ActivoBank format:
  - Header rows 1–7 (account number, currency, date range, etc.)
  - Data starts at row 8 with columns:
      Data Lanc. | Data Valor | Descrição | Valor | Saldo
  - Valor: negative = expense, positive = income/transfer in
"""

import io
import pytest
from openpyxl import Workbook

from excel_parser import parse_activobank_export, Transaction


def make_export_wb(rows: list[tuple]) -> Workbook:
    """Build a minimal ActivoBank-format workbook for testing."""
    wb = Workbook()
    ws = wb.active
    # Header rows 1–7
    ws.append(["NIB:", "PT50000000000000000000000"])
    ws.append(["Moeda:", "EUR"])
    ws.append(["De:", "01-01-2025"])
    ws.append(["A:", "31-01-2025"])
    ws.append([])
    ws.append([])
    ws.append(["Data Lanc.", "Data Valor", "Descrição", "Valor", "Saldo"])
    # Data rows from row 8
    for row in rows:
        ws.append(row)
    return wb


def save_and_load(wb: Workbook) -> bytes:
    """Serialize workbook to bytes (simulating a file upload)."""
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Basic parsing
# ---------------------------------------------------------------------------

def test_parses_expense_row():
    wb = make_export_wb([
        ("2025-01-15", "2025-01-15", "PINGO DOCE SALDANHA", -45.30, 1200.00),
    ])
    transactions = parse_activobank_export(save_and_load(wb))
    assert len(transactions) == 1
    t = transactions[0]
    assert t.description == "PINGO DOCE SALDANHA"
    assert t.amount == -45.30
    assert t.balance == 1200.00


def test_parses_income_row():
    wb = make_export_wb([
        ("2025-01-01", "2025-01-01", "TRANSFERENCIA RECEBIDA SALARIO", 3500.00, 4700.00),
    ])
    transactions = parse_activobank_export(save_and_load(wb))
    assert len(transactions) == 1
    assert transactions[0].amount == 3500.00


def test_skips_header_rows():
    wb = make_export_wb([
        ("2025-01-10", "2025-01-10", "CONTINENTE ONLINE", -87.60, 950.00),
        ("2025-01-20", "2025-01-20", "MBWAY TRANSFER", -40.00, 910.00),
    ])
    transactions = parse_activobank_export(save_and_load(wb))
    assert len(transactions) == 2


def test_returns_transaction_objects():
    wb = make_export_wb([
        ("2025-01-05", "2025-01-05", "NETFLIX", -15.99, 2000.00),
    ])
    transactions = parse_activobank_export(save_and_load(wb))
    t = transactions[0]
    assert isinstance(t, Transaction)
    assert hasattr(t, "posting_date")
    assert hasattr(t, "value_date")
    assert hasattr(t, "description")
    assert hasattr(t, "amount")
    assert hasattr(t, "balance")


def test_empty_export_returns_empty_list():
    wb = make_export_wb([])
    transactions = parse_activobank_export(save_and_load(wb))
    assert transactions == []


# ---------------------------------------------------------------------------
# Amount sign and type
# ---------------------------------------------------------------------------

def test_negative_amounts_are_expenses():
    wb = make_export_wb([
        ("2025-01-01", "2025-01-01", "EDP COMERCIAL", -120.00, 800.00),
    ])
    t = parse_activobank_export(save_and_load(wb))[0]
    assert t.amount < 0
    assert t.is_expense is True


def test_positive_amounts_are_not_expenses():
    wb = make_export_wb([
        ("2025-01-01", "2025-01-01", "REEMBOLSO IRS", 800.00, 2800.00),
    ])
    t = parse_activobank_export(save_and_load(wb))[0]
    assert t.amount > 0
    assert t.is_expense is False


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

def test_parses_dates_as_date_objects():
    from datetime import date
    wb = make_export_wb([
        ("2025-03-15", "2025-03-17", "ATM LEVANTAR", -100.00, 500.00),
    ])
    t = parse_activobank_export(save_and_load(wb))[0]
    assert t.posting_date == date(2025, 3, 15)
    assert t.value_date == date(2025, 3, 17)


# ---------------------------------------------------------------------------
# Multiple rows and ordering
# ---------------------------------------------------------------------------

def test_preserves_order():
    wb = make_export_wb([
        ("2025-01-01", "2025-01-01", "FIRST", -10.00, 990.00),
        ("2025-01-02", "2025-01-02", "SECOND", -20.00, 970.00),
        ("2025-01-03", "2025-01-03", "THIRD", -30.00, 940.00),
    ])
    transactions = parse_activobank_export(save_and_load(wb))
    assert [t.description for t in transactions] == ["FIRST", "SECOND", "THIRD"]


def test_skips_blank_rows():
    wb = make_export_wb([
        ("2025-01-01", "2025-01-01", "VALID", -50.00, 950.00),
        (None, None, None, None, None),  # blank row
        ("2025-01-03", "2025-01-03", "ALSO VALID", -25.00, 925.00),
    ])
    transactions = parse_activobank_export(save_and_load(wb))
    assert len(transactions) == 2
    assert transactions[0].description == "VALID"
    assert transactions[1].description == "ALSO VALID"
