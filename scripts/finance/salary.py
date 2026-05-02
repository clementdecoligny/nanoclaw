#!/usr/bin/env python3
"""
salary.py — Branca salary calculations

Contract:
  Employee:    Branca Manuel Gaspar (NIF 323404138)
  Employer:    Clément Rouault de Coligny (NIF 291628788)
  Function:    Empregada Doméstica — Contrato de trabalho doméstico
  Hourly rate: €5.75/h

Usage (CLI):
  python3 salary.py <hours_worked> [--year YYYY] [--month MM]

Output: JSON with full breakdown or formatted receipt lines.
"""

from __future__ import annotations

import json
import sys
from decimal import ROUND_HALF_UP, Decimal

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HOURLY_RATE = Decimal("5.75")
NAVEGANTE = Decimal("40.00")
SS_WORKER_RATE = Decimal("0.0507")    # 5.07% — paid by employer
SS_EMPLOYER_RATE = Decimal("0.102")   # 10.2%
PROVISION_RATE = Decimal("1") / Decimal("12")   # 1/12 for férias + natal


def _round2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Core calculation — all arithmetic in Decimal to avoid float drift
# ---------------------------------------------------------------------------

def calculate_salary(
    hours_worked: float,
    historical_base_salaries: list[float] | None = None,
) -> dict:
    """
    Return a full salary breakdown dict for the given hours worked.

    historical_base_salaries: base salaries from all prior months (not including
      current month). If provided, férias and natal are 1/12 of the average
      base salary across all months (history + current). If omitted or empty,
      the current month's base salary is used alone.

    All monetary values are returned as plain Python floats (2 decimal places)
    so they serialize cleanly to JSON.
    """
    h = Decimal(str(hours_worked))
    base = _round2(h * HOURLY_RATE)

    # Average base salary for férias/natal calculation
    if historical_base_salaries:
        all_bases = [Decimal(str(b)) for b in historical_base_salaries] + [base]
        average_base = sum(all_bases) / Decimal(str(len(all_bases)))
    else:
        average_base = base

    ferias = _round2(average_base * PROVISION_RATE)
    natal = ferias
    navegante = NAVEGANTE
    ss_worker = _round2(base * SS_WORKER_RATE)
    ss_employer = _round2(base * SS_EMPLOYER_RATE)
    total_remuneracoes = _round2(base + ferias + natal)
    total_a_pagar = _round2(total_remuneracoes + navegante)

    return {
        "hours_worked": float(h),
        "hourly_rate": float(HOURLY_RATE),
        "base_salary": float(base),
        "average_base_salary": float(average_base),
        "ferias": float(ferias),
        "natal": float(natal),
        "navegante": float(navegante),
        "ss_worker": float(ss_worker),
        "ss_employer": float(ss_employer),
        "total_remuneracoes": float(total_remuneracoes),
        "total_a_pagar": float(total_a_pagar),
    }


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def format_currency(amount: float) -> str:
    """Format a float as Portuguese currency: '920,00 €'"""
    d = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    integer_part, decimal_part = str(d).split(".")
    return f"{integer_part},{decimal_part} €"


def format_breakdown(breakdown: dict, year: int, month: int) -> str:
    """Return a human-readable salary breakdown for review."""
    import calendar
    month_name = calendar.month_name[month]

    lines = [
        f"=== Recibo de Vencimento — {month_name} {year} ===",
        f"",
        f"Empregada: Branca Manuel Gaspar (NIF 323404138)",
        f"Entidade:  Clément Rouault de Coligny (NIF 291628788)",
        f"Função:    Empregada Doméstica",
        f"",
        f"--- Remunerações ---",
        f"Salário Base ({breakdown['hours_worked']:.2f}h × {format_currency(breakdown['hourly_rate'])}): {format_currency(breakdown['base_salary'])}",
        f"Média salário base:                               {format_currency(breakdown['average_base_salary'])}",
        f"Subsídio de Férias (1/12 da média):               {format_currency(breakdown['ferias'])}",
        f"Subsídio de Natal (1/12 da média):                {format_currency(breakdown['natal'])}",
        f"Passe Navegante (isento SS/IRS):                  {format_currency(breakdown['navegante'])}",
        f"",
        f"Total Remunerações:                               {format_currency(breakdown['total_remuneracoes'])}",
        f"",
        f"--- Descontos (suportados pela entidade patronal) ---",
        f"Quota SS trabalhador (5,07%):                     {format_currency(breakdown['ss_worker'])}",
        f"",
        f"--- Encargos patronais ---",
        f"SS entidade patronal (10,2%):                     {format_currency(breakdown['ss_employer'])}",
        f"",
        f"TOTAL A PAGAR (MBWay):                            {format_currency(breakdown['total_a_pagar'])}",
        f"",
        f"Nota: A quota do trabalhador é suportada pela entidade patronal.",
        f"      SS patronal ({format_currency(breakdown['ss_employer'])}) pago separadamente à Segurança Social.",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse
    from datetime import date

    parser = argparse.ArgumentParser(description="Calculate Branca salary")
    parser.add_argument("hours_worked", type=float, help="Hours worked this month")
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument("--month", type=int, default=date.today().month)
    parser.add_argument(
        "--history",
        type=str,
        default=None,
        help="Comma-separated prior months' base salaries, e.g. 431.25,500.25,528.71",
    )
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    history = (
        [float(x) for x in args.history.split(",") if x.strip()]
        if args.history else None
    )
    breakdown = calculate_salary(args.hours_worked, historical_base_salaries=history)

    if args.json:
        print(json.dumps(breakdown, ensure_ascii=False))
    else:
        print(format_breakdown(breakdown, year=args.year, month=args.month))


if __name__ == "__main__":
    main()
