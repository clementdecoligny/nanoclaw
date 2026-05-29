#!/opt/wpenv/bin/python3
"""Generate Branca's salary receipt in the official April-2026 format."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from salary import calculate
import json

EMPLOYER = {
    "name": "Clément Rouault de Coligny",
    "nif": "291628788",
    "address": "Rua Eduardo Coelho, 46 2D",
    "city": "1200-168 Lisboa",
}
EMPLOYEE = {
    "name": "Branca Manuel Gaspar",
    "nif": "323404138",
    "role": "Empregada Doméstica",
}

MONTH_NAMES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
}

# Last business day of each month in 2026
PAYMENT_DATES = {
    1: "30/01/2026", 2: "27/02/2026", 3: "31/03/2026", 4: "30/04/2026",
    5: "29/05/2026", 6: "30/06/2026", 7: "31/07/2026", 8: "31/08/2026",
    9: "30/09/2026", 10: "30/10/2026", 11: "30/11/2026", 12: "31/12/2026"
}


def fmt(v):
    """Format as Portuguese decimal: 1.234,56"""
    return f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def build_html(r):
    month_name = MONTH_NAMES_PT.get(r["month"], str(r["month"]))
    payment_date = PAYMENT_DATES.get(r["month"], "")
    total_remuneracoes = r["base_salary"] + r["subsidio_ferias"] + r["subsidio_natal"]
    total_ss = r["ss_worker"] + r["ss_employer"]

    return f"""<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<style>
  @page {{ size: A4; margin: 1.8cm 2cm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: Arial, sans-serif; font-size: 10pt; color: #1a1a1a; margin: 0; }}

  /* Header */
  .header {{ display: flex; justify-content: space-between; margin-bottom: 18px; }}
  .header-left {{ font-size: 10pt; line-height: 1.5; }}
  .header-left .emp-name {{ font-weight: bold; font-size: 11pt; }}
  .header-right {{ text-align: left; font-size: 10pt; line-height: 1.5; }}
  .header-right .worker-name {{ font-weight: bold; }}

  /* Info row */
  .info-table {{ width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9.5pt; }}
  .info-table th {{ background: #e8edf4; border: 1px solid #aab; padding: 5px 10px; text-align: center; font-weight: bold; }}
  .info-table td {{ border: 1px solid #aab; padding: 5px 10px; text-align: center; }}

  /* Section title */
  .section-title {{ display: flex; justify-content: space-between; align-items: baseline;
                    border-bottom: 1.5px solid #1a1a1a; padding-bottom: 3px; margin-bottom: 0; }}
  .section-title .left {{ font-weight: bold; font-size: 10.5pt; }}
  .section-title .right {{ font-size: 10.5pt; font-weight: bold; }}

  /* Main table */
  .main-table {{ width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9.5pt; }}
  .main-table th {{ background: #e8edf4; border: 1px solid #aab; padding: 5px 8px; text-align: center; font-weight: bold; }}
  .main-table td {{ border: 1px solid #aab; padding: 4px 8px; vertical-align: top; }}
  .main-table td.num {{ text-align: right; }}
  .main-table tr.empty td {{ height: 18px; }}

  /* Note */
  .note {{ font-size: 8.5pt; font-style: italic; border: 1px solid #aab; padding: 6px 10px;
           margin-bottom: 12px; background: #fafbfc; }}

  /* Summary table */
  .summary-table {{ width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 9.5pt; }}
  .summary-table th {{ background: #e8edf4; border: 1px solid #aab; padding: 5px 8px; text-align: center; font-weight: bold; }}
  .summary-table td {{ border: 1px solid #aab; padding: 5px 8px; text-align: center; }}
  .summary-table td.label {{ font-weight: bold; width: 3em; }}
  .summary-table td.total {{ font-weight: bold; }}

  /* Payment row */
  .payment-table {{ width: 100%; border-collapse: collapse; margin-top: 0; font-size: 9.5pt; }}
  .payment-table th {{ background: #e8edf4; border: 1px solid #aab; padding: 5px 8px; text-align: center; font-weight: bold; }}
  .payment-table td {{ border: 1px solid #aab; padding: 5px 8px; text-align: center; }}
  .payment-table td.total {{ font-weight: bold; text-align: right; padding-right: 20px; }}

  /* Signatures */
  .sig {{ margin-top: 36px; display: flex; justify-content: space-between; font-size: 9.5pt; }}
  .sig-block {{ width: 44%; }}
  .sig-line {{ border-top: 1px solid #333; padding-top: 4px; color: #333; }}
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="emp-name">{EMPLOYER["name"]}</div>
    <div>NIF: {EMPLOYER["nif"]}</div>
    <div>{EMPLOYER["address"]}</div>
    <div>{EMPLOYER["city"]}</div>
  </div>
  <div class="header-right">
    <div>Exmo(a). Senhor(a)</div>
    <div class="worker-name">{EMPLOYEE["name"]}</div>
    <div>NIF: {EMPLOYEE["nif"]}</div>
  </div>
</div>

<table class="info-table">
  <thead>
    <tr>
      <th>NIF Trabalhador</th>
      <th>Data Pagamento</th>
      <th>Forma de Pagamento</th>
      <th>Função</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>{EMPLOYEE["nif"]}</td>
      <td>{payment_date}</td>
      <td>MBWay</td>
      <td>{EMPLOYEE["role"]}</td>
    </tr>
  </tbody>
</table>

<div class="section-title">
  <span class="left">NOTA DE REMUNERAÇÕES E DEDUÇÕES</span>
  <span class="right">{month_name} / {r["year"]}</span>
</div>

<table class="main-table">
  <thead>
    <tr>
      <th>Designação</th>
      <th>Quant.</th>
      <th>Valor</th>
      <th>Designação</th>
      <th>V. Base</th>
      <th>Valor</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Salário Base</td>
      <td>{int(r["hours"])}h</td>
      <td class="num">{fmt(r["base_salary"])}</td>
      <td>Seg. Social trabalhador (quota mensal)</td>
      <td class="num">{fmt(r["base_salary"])}</td>
      <td class="num">{fmt(r["ss_worker"])}</td>
    </tr>
    <tr>
      <td>Subsídio de Férias – 1/12 (provisão)</td>
      <td>1 U</td>
      <td class="num">{fmt(r["subsidio_ferias"])}</td>
      <td colspan="3">SS s/ subsídios: liquidado no mês do pagamento</td>
    </tr>
    <tr>
      <td>Subsídio de Natal – 1/12 (provisão)</td>
      <td>1 U</td>
      <td class="num">{fmt(r["subsidio_natal"])}</td>
      <td></td><td></td><td></td>
    </tr>
    <tr>
      <td>Pass Navegante (isento SS/IRS)</td>
      <td>1 U</td>
      <td class="num">{fmt(r["navegante"])}</td>
      <td></td><td></td><td></td>
    </tr>
    <tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="empty"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>

<div class="note">
  Nota: SS calculado sobre salário base (regime horário). Quota trabalhador ({fmt(r["ss_worker"])}€) suportada pela entidade patronal. Encargo patronal: {fmt(r["ss_employer"])}€. Total SS mensal: {fmt(total_ss)}€. SS sobre subsídios liquidado no mês do pagamento.
</div>

<table class="summary-table">
  <thead>
    <tr>
      <th></th>
      <th>Total Remunerações</th>
      <th>Desconto SS Trabalhador</th>
      <th>Encargo SS Patronal</th>
      <th>Total a Pagar</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="label">EUR</td>
      <td>{fmt(total_remuneracoes)}</td>
      <td>{fmt(r["ss_worker"])}</td>
      <td>{fmt(r["ss_employer"])}</td>
      <td class="total">{fmt(r["total_mbway"])}</td>
    </tr>
  </tbody>
</table>

<table class="payment-table">
  <thead>
    <tr>
      <th>Forma de Pagamento</th>
      <th>Valor a Transferir</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>MBWay</td>
      <td class="total">{fmt(r["total_mbway"])}</td>
    </tr>
  </tbody>
</table>

<div class="sig">
  <div class="sig-block">
    <div class="sig-line">O/A Trabalhador/a ___________________________ Branca<br/>Manuel Gaspar</div>
  </div>
  <div class="sig-block">
    <div class="sig-line">A Entidade Patronal ___________________________ Clément<br/>Rouault de Coligny</div>
  </div>
</div>

</body>
</html>"""


def main():
    import json as _json
    history_path = os.path.join(os.path.dirname(__file__), "../salary/history.json")
    with open(history_path) as f:
        history = _json.load(f)

    months = history["months"]
    # Find May 2026
    target = next(m for m in months if m["year"] == 2026 and m["month"] == 5)
    prior_bases = [m["base_salary"] for m in months if (m["year"], m["month"]) < (2026, 5)]

    r = calculate(target["hours"], 2026, 5, prior_bases)
    html = build_html(r)

    output = os.path.join(os.path.dirname(__file__), "../salary/2026-05-recibo.pdf")
    from weasyprint import HTML
    HTML(string=html).write_pdf(output)
    print(f"PDF saved: {output}")


if __name__ == "__main__":
    main()
