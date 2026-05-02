"""
test_salary.py — TDD tests for Branca salary calculations

Rules (from reference receipt recibo_Branca_marco_2026.pdf + updated rules):
  Hourly rate:          €5.75/h
  Subsídio de Férias:   1/12 of average base salary (all months since start)
  Subsídio de Natal:    1/12 of average base salary (all months since start)
  Pass Navegante:       €40.00/month (fixed, SS-exempt)
  SS worker:            5.07% of base salary — paid directly to SS website by employer
  SS employer:          10.2% of base salary — paid directly to SS website by employer

  Both SS amounts are informational: Clément pays them directly on the SS website.
  Neither is included in the MBWay transfer to Branca.

  total_remuneracoes = base + férias + natal            (navegante excluded)
  total_a_pagar      = total_remuneracoes + navegante   (MBWay transfer amount)

Reference verification (março 2026 — 91.95h, no prior history):
  base              = 91.95 × 5.75 = 528.71 (ROUND_HALF_UP)
  average_base      = 528.71        (first month, no history)
  férias            = 528.71 / 12  =  44.06
  natal             = 528.71 / 12  =  44.06
  navegante         =               =  40.00
  ss_worker         = 528.71 × 5.07% = 26.81
  ss_employer       = 528.71 × 10.2% = 53.93
  total_remuneracoes= 528.71 + 44.06 + 44.06 = 616.83
  total_a_pagar     = 616.83 + 40.00          = 656.83

Historical average verification (April 2026 — 96h, history = Jan/Feb/Mar):
  base              = 96 × 5.75 = 552.00
  history           = [431.25, 500.25, 528.71]  (Jan, Feb, Mar)
  average_base      = (431.25 + 500.25 + 528.71 + 552.00) / 4 = 503.0525
  férias            = 503.0525 / 12 = 41.92
  natal             = 503.0525 / 12 = 41.92
  total_remuneracoes= 552.00 + 41.92 + 41.92 = 635.84
  total_a_pagar     = 635.84 + 40.00          = 675.84
"""

import pytest
from salary import calculate_salary, format_currency


# ---------------------------------------------------------------------------
# Reference receipt verification (março 2026 — 91.95h, no prior history)
# ---------------------------------------------------------------------------

def test_reference_base_salary():
    """91.95h × €5.75 = €528.71 (matches reference receipt)"""
    result = calculate_salary(hours_worked=91.95)
    assert result["base_salary"] == 528.71


def test_reference_ferias():
    """No history → férias = base / 12 = 44.06"""
    result = calculate_salary(hours_worked=91.95)
    assert result["ferias"] == 44.06


def test_reference_natal():
    result = calculate_salary(hours_worked=91.95)
    assert result["natal"] == 44.06


def test_reference_total_remuneracoes():
    """Total Remunerações = base + férias + natal = 616.83 (matches reference)"""
    result = calculate_salary(hours_worked=91.95)
    assert result["total_remuneracoes"] == 616.83


def test_reference_total_a_pagar():
    """Total a Pagar (MBWay) = 656.83 (matches reference receipt)"""
    result = calculate_salary(hours_worked=91.95)
    assert result["total_a_pagar"] == 656.83


def test_reference_ss_worker():
    """SS trabalhador = 528.71 × 5.07% = 26.81 (matches reference)"""
    result = calculate_salary(hours_worked=91.95)
    assert result["ss_worker"] == 26.81


# ---------------------------------------------------------------------------
# Historical average (April 2026 — 96h, history = [431.25, 500.25, 528.71])
# ---------------------------------------------------------------------------

def test_historical_average_ferias():
    """April 2026: average of Jan/Feb/Mar/Apr base → férias = 41.92"""
    result = calculate_salary(
        hours_worked=96.0,
        historical_base_salaries=[431.25, 500.25, 528.71],
    )
    assert result["base_salary"] == 552.00
    assert result["average_base_salary"] == round((431.25 + 500.25 + 528.71 + 552.00) / 4, 10)
    assert result["ferias"] == 41.92


def test_historical_average_natal():
    result = calculate_salary(
        hours_worked=96.0,
        historical_base_salaries=[431.25, 500.25, 528.71],
    )
    assert result["natal"] == 41.92


def test_historical_average_total_remuneracoes():
    result = calculate_salary(
        hours_worked=96.0,
        historical_base_salaries=[431.25, 500.25, 528.71],
    )
    assert result["total_remuneracoes"] == round(552.00 + 41.92 + 41.92, 2)


def test_historical_average_total_a_pagar():
    result = calculate_salary(
        hours_worked=96.0,
        historical_base_salaries=[431.25, 500.25, 528.71],
    )
    assert result["total_a_pagar"] == round(result["total_remuneracoes"] + 40.00, 2)


def test_single_month_history_same_as_no_history():
    """Passing only the current month as history = same as no history"""
    no_history = calculate_salary(hours_worked=91.95)
    with_self = calculate_salary(hours_worked=91.95, historical_base_salaries=[])
    assert no_history["ferias"] == with_self["ferias"]
    assert no_history["natal"] == with_self["natal"]


def test_two_month_history():
    """Two months: average = (prev + current) / 2"""
    result = calculate_salary(
        hours_worked=160.0,
        historical_base_salaries=[500.00],
    )
    # base = 920.00, average = (500 + 920) / 2 = 710.00
    assert result["base_salary"] == 920.00
    assert result["ferias"] == round(710.00 / 12, 2)  # 59.17


def test_average_base_salary_field_no_history():
    """average_base_salary = base_salary when no history"""
    result = calculate_salary(hours_worked=160.0)
    assert result["average_base_salary"] == result["base_salary"]


def test_average_base_salary_field_with_history():
    result = calculate_salary(
        hours_worked=96.0,
        historical_base_salaries=[431.25, 500.25, 528.71],
    )
    assert "average_base_salary" in result
    # (431.25 + 500.25 + 528.71 + 552.00) / 4 = 503.0525
    assert abs(result["average_base_salary"] - 503.0525) < 0.0001


# ---------------------------------------------------------------------------
# Core calculation rules
# ---------------------------------------------------------------------------

def test_base_salary_from_hours():
    result = calculate_salary(hours_worked=160.0)
    assert result["hours_worked"] == 160.0
    assert result["hourly_rate"] == 5.75
    assert round(result["base_salary"], 2) == 920.00


def test_ferias_is_twelfth_of_base_no_history():
    result = calculate_salary(hours_worked=160.0)
    assert result["ferias"] == round(920.0 / 12, 2)  # 76.67


def test_natal_is_twelfth_of_base_no_history():
    result = calculate_salary(hours_worked=160.0)
    assert result["natal"] == round(920.0 / 12, 2)  # 76.67


def test_navegante_is_fixed_40():
    result = calculate_salary(hours_worked=160.0)
    assert result["navegante"] == 40.0


def test_ss_worker_rate_5_07_percent():
    result = calculate_salary(hours_worked=160.0)
    assert result["ss_worker"] == round(920.0 * 0.0507, 2)


def test_ss_employer_rate_10_2_percent():
    result = calculate_salary(hours_worked=160.0)
    assert result["ss_employer"] == round(920.0 * 0.102, 2)


def test_total_remuneracoes_excludes_navegante():
    """Total Remunerações = base + férias + natal only (NOT navegante)"""
    result = calculate_salary(hours_worked=160.0)
    base = 920.0
    ferias = round(base / 12, 2)
    natal = round(base / 12, 2)
    expected = round(base + ferias + natal, 2)
    assert result["total_remuneracoes"] == expected


def test_total_a_pagar_is_remuneracoes_plus_navegante():
    """Total a Pagar (MBWay) = total_remuneracoes + navegante. SS is NOT included."""
    result = calculate_salary(hours_worked=160.0)
    expected = round(result["total_remuneracoes"] + 40.0, 2)
    assert result["total_a_pagar"] == expected


def test_ss_not_included_in_total_a_pagar():
    """Both SS amounts are paid directly to SS website — not part of MBWay transfer."""
    result = calculate_salary(hours_worked=160.0)
    without_ss = round(result["total_remuneracoes"] + result["navegante"], 2)
    assert result["total_a_pagar"] == without_ss


def test_fractional_hours():
    result = calculate_salary(hours_worked=87.5)
    # 87.5 × 5.75 = 503.125 → ROUND_HALF_UP → 503.13
    assert result["base_salary"] == 503.13
    assert result["ss_worker"] == round(503.13 * 0.0507, 2)


def test_all_fields_present():
    result = calculate_salary(hours_worked=100.0)
    required = [
        "hours_worked", "hourly_rate", "base_salary", "average_base_salary",
        "ferias", "natal", "navegante",
        "ss_worker", "ss_employer",
        "total_remuneracoes", "total_a_pagar",
    ]
    for key in required:
        assert key in result, f"Missing field: {key}"


# ---------------------------------------------------------------------------
# format_currency
# ---------------------------------------------------------------------------

def test_format_currency_basic():
    assert format_currency(920.0) == "920,00 €"
    assert format_currency(40.0) == "40,00 €"


def test_format_currency_rounds_correctly():
    # 920 / 12 = 76.6666... → 76,67 €
    assert format_currency(920.0 / 12) == "76,67 €"
