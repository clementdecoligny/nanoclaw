#!/opt/wpenv/bin/python3
"""Calculate Branca's monthly salary breakdown.

Usage:
  salary.py <hours> --year YYYY --month MM --history base1,base2,... [--json]

The --history argument lists prior months' base salaries in chronological order
(not including the current month). The current month's base is computed from hours.
"""

import argparse
import json
from decimal import Decimal, ROUND_HALF_UP

HOURLY_RATE = Decimal("5.75")
NAVEGANTE = Decimal("40.00")
SS_WORKER_RATE = Decimal("0.0507")
SS_EMPLOYER_RATE = Decimal("0.102")

MONTH_NAMES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
}


def cents(v):
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate(hours, year, month, prior_bases):
    base = cents(Decimal(str(hours)) * HOURLY_RATE)
    all_bases = [cents(b) for b in prior_bases] + [base]
    avg_base = cents(sum(all_bases) / len(all_bases))
    sub_ferias = cents(avg_base / 12)
    sub_natal = cents(avg_base / 12)
    ss_worker = cents(base * SS_WORKER_RATE)
    ss_employer = cents(base * SS_EMPLOYER_RATE)
    total_mbway = base + sub_ferias + sub_natal + NAVEGANTE

    return {
        "year": year,
        "month": month,
        "month_name": MONTH_NAMES_PT.get(month, str(month)),
        "hours": float(Decimal(str(hours))),
        "hourly_rate": float(HOURLY_RATE),
        "base_salary": float(base),
        "avg_base_all_months": float(avg_base),
        "subsidio_ferias": float(sub_ferias),
        "subsidio_natal": float(sub_natal),
        "navegante": float(NAVEGANTE),
        "ss_worker": float(ss_worker),
        "ss_employer": float(ss_employer),
        "total_mbway": float(total_mbway),
        "months_count": len(all_bases),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("hours", type=float)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--month", type=int, required=True)
    parser.add_argument("--history", default="",
                        help="Comma-separated prior base salaries")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    prior_bases = [float(x) for x in args.history.split(",") if x.strip()]
    result = calculate(args.hours, args.year, args.month, prior_bases)

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        r = result
        print(f"Salário {r['month_name']} {r['year']} — Branca Manuel Gaspar")
        print(f"  Horas trabalhadas : {r['hours']:.2f}h × {r['hourly_rate']:.2f}€ = {r['base_salary']:.2f}€")
        print(f"  Média base ({r['months_count']} meses) : {r['avg_base_all_months']:.2f}€")
        print(f"  Subsídio de Férias (1/12 avg) : {r['subsidio_ferias']:.2f}€")
        print(f"  Subsídio de Natal  (1/12 avg) : {r['subsidio_natal']:.2f}€")
        print(f"  Navegante (passe)              : {r['navegante']:.2f}€")
        print(f"  ─────────────────────────────────────────")
        print(f"  TOTAL A PAGAR (MBWay)          : {r['total_mbway']:.2f}€")
        print(f"  [Info] SS trabalhador (5,07%)  : {r['ss_worker']:.2f}€  (pago separadamente)")
        print(f"  [Info] SS patronal   (10,2%)   : {r['ss_employer']:.2f}€  (pago separadamente)")


if __name__ == "__main__":
    main()
