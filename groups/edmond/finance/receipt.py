#!/opt/wpenv/bin/python3
"""Generate Branca's salary receipt as PDF using weasyprint.

Usage:
  receipt.py <hours> --year YYYY --month MM --history base1,base2,... --output path.pdf
"""

import argparse
import sys
import os

# Add finance dir to path for salary module
sys.path.insert(0, os.path.dirname(__file__))
from salary import calculate

EMPLOYER = {
    "name": "Clément Rouault de Coligny",
    "nif": "291 628 788",
    "address": "Rua Eduardo Coelho, 46 2D",
    "city": "1200-168 Lisboa",
}
EMPLOYEE = {
    "name": "Branca Manuel Gaspar",
    "nif": "323 404 138",
    "role": "Empregada Doméstica",
    "contract": "Contrato de trabalho doméstico",
}

MONTH_NAMES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
}


def fmt(v):
    return f"{v:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def build_html(r):
    month_name = MONTH_NAMES_PT.get(r["month"], str(r["month"]))
    return f"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<style>
  @page {{ size: A4; margin: 2cm 2.5cm; }}
  body {{ font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }}
  h1 {{ font-size: 15pt; text-align: center; margin-bottom: 4px; color: #1F4E79; }}
  .subtitle {{ text-align: center; color: #555; margin-bottom: 24px; font-size: 10pt; }}
  .parties {{ display: flex; gap: 40px; margin-bottom: 24px; }}
  .party {{ flex: 1; background: #f4f7fb; border-radius: 6px; padding: 12px 16px; }}
  .party h3 {{ margin: 0 0 6px; font-size: 10pt; text-transform: uppercase;
                letter-spacing: 0.5px; color: #1F4E79; }}
  .party p {{ margin: 2px 0; font-size: 10pt; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
  th {{ background: #1F4E79; color: #fff; padding: 8px 12px;
        text-align: left; font-size: 10pt; }}
  td {{ padding: 7px 12px; border-bottom: 1px solid #e0e6ef; font-size: 10pt; }}
  tr:last-child td {{ border-bottom: none; }}
  .amount {{ text-align: right; }}
  .total-row td {{ background: #1F4E79; color: #fff; font-weight: bold;
                   font-size: 11pt; }}
  .info-row td {{ background: #f4f7fb; color: #555; font-size: 9.5pt; }}
  .note {{ font-size: 9pt; color: #777; margin-top: 16px; border-top: 1px solid #ddd;
           padding-top: 10px; }}
  .sig {{ margin-top: 40px; display: flex; justify-content: space-between; }}
  .sig-block {{ width: 45%; }}
  .sig-line {{ border-top: 1px solid #333; margin-top: 32px; padding-top: 4px;
               font-size: 9.5pt; color: #555; }}
</style>
</head>
<body>
<h1>Recibo de Vencimento</h1>
<div class="subtitle">{month_name} {r["year"]}</div>

<div class="parties">
  <div class="party">
    <h3>Empregador</h3>
    <p><strong>{EMPLOYER["name"]}</strong></p>
    <p>NIF: {EMPLOYER["nif"]}</p>
    <p>{EMPLOYER["address"]}</p>
    <p>{EMPLOYER["city"]}</p>
  </div>
  <div class="party">
    <h3>Trabalhador</h3>
    <p><strong>{EMPLOYEE["name"]}</strong></p>
    <p>NIF: {EMPLOYEE["nif"]}</p>
    <p>{EMPLOYEE["role"]}</p>
    <p>{EMPLOYEE["contract"]}</p>
  </div>
</div>

<table>
  <thead>
    <tr><th>Descrição</th><th>Detalhe</th><th class="amount">Valor</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>Salário base</td>
      <td>{r["hours"]:.2f}h × {fmt(r["hourly_rate"])}</td>
      <td class="amount">{fmt(r["base_salary"])}</td>
    </tr>
    <tr>
      <td>Subsídio de Férias</td>
      <td>1/12 × média base ({r["months_count"]} meses = {fmt(r["avg_base_all_months"])})</td>
      <td class="amount">{fmt(r["subsidio_ferias"])}</td>
    </tr>
    <tr>
      <td>Subsídio de Natal</td>
      <td>1/12 × média base ({r["months_count"]} meses = {fmt(r["avg_base_all_months"])})</td>
      <td class="amount">{fmt(r["subsidio_natal"])}</td>
    </tr>
    <tr>
      <td>Navegante (passe)</td>
      <td>Isento SS e IRS</td>
      <td class="amount">{fmt(r["navegante"])}</td>
    </tr>
    <tr class="total-row">
      <td colspan="2">TOTAL A PAGAR (MBWay)</td>
      <td class="amount">{fmt(r["total_mbway"])}</td>
    </tr>
    <tr class="info-row">
      <td>SS Trabalhador (5,07%) — informativo</td>
      <td>Pago pelo empregador no site SS</td>
      <td class="amount">{fmt(r["ss_worker"])}</td>
    </tr>
    <tr class="info-row">
      <td>SS Patronal (10,2%) — informativo</td>
      <td>Pago pelo empregador no site SS</td>
      <td class="amount">{fmt(r["ss_employer"])}</td>
    </tr>
  </tbody>
</table>

<div class="note">
  As contribuições para a Segurança Social são pagas diretamente pelo empregador no portal da Segurança Social e não estão incluídas no pagamento via MBWay.<br/>
  Pagamento via MBWay até ao último dia útil do mês.
</div>

<div class="sig">
  <div class="sig-block">
    <div class="sig-line">Empregador — {EMPLOYER["name"]}</div>
  </div>
  <div class="sig-block">
    <div class="sig-line">Trabalhador — {EMPLOYEE["name"]}</div>
  </div>
</div>

</body>
</html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("hours", type=float)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--month", type=int, required=True)
    parser.add_argument("--history", default="")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    prior_bases = [float(x) for x in args.history.split(",") if x.strip()]
    r = calculate(args.hours, args.year, args.month, prior_bases)

    html = build_html(r)

    if args.output.endswith(".pdf"):
        from weasyprint import HTML
        HTML(string=html).write_pdf(args.output)
        print(f"PDF saved: {args.output}")
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"HTML saved: {args.output}")


if __name__ == "__main__":
    main()
