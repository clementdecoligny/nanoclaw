#!/opt/wpenv/bin/python3
"""Calculate Branca's monthly salary breakdown.

Usage:
  salary.py <hours> --year YYYY --month MM [--history base1,base2,...] [--json]

Subsídio de férias / natal = 1/12 da média dos salários base de Janeiro até ao
mês corrente (inclusive). Por defeito o script lê AUTOMATICAMENTE todos os meses
anteriores a partir do ficheiro de histórico canónico (HISTORY_FILE) — não é
preciso passar --history à mão. O mês corrente é sempre calculado a partir das
horas e substitui qualquer entrada já gravada para esse mês no histórico.

--history continua disponível como override manual (testes / correções pontuais).
"""

import argparse
import json
import os
from decimal import Decimal, ROUND_HALF_UP

# Fonte de vérité pour l'historique des salaires base (tous les mois depuis janvier).
HISTORY_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "salary", "history.json",
)

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


def load_prior_bases(year, month, history_file=HISTORY_FILE):
    """Lit history.json et renvoie les salaires base de tous les mois
    STRICTEMENT antérieurs à (year, month), triés chronologiquement.

    Le mois courant est volontairement exclu : sa base est recalculée à partir
    des heures dans calculate(), ce qui évite tout double comptage même si le
    mois courant a déjà été enregistré dans l'historique."""
    with open(history_file, encoding="utf-8") as fh:
        data = json.load(fh)
    months = sorted(
        (m for m in data.get("months", [])
         if (m["year"], m["month"]) < (year, month)),
        key=lambda m: (m["year"], m["month"]),
    )
    return [m["base_salary"] for m in months]


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
    parser.add_argument("--history", default=None,
                        help="Override manuel : salaires base antérieurs, "
                             "séparés par des virgules. Par défaut, lus "
                             "automatiquement depuis history.json.")
    parser.add_argument("--history-file", default=HISTORY_FILE,
                        dest="history_file",
                        help="Chemin du fichier d'historique (défaut : canonique).")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    if args.history is not None:
        prior_bases = [float(x) for x in args.history.split(",") if x.strip()]
    else:
        prior_bases = load_prior_bases(args.year, args.month, args.history_file)
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
