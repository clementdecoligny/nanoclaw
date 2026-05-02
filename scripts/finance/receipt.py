#!/usr/bin/env python3
"""
receipt.py — Generate an HTML salary receipt for Branca

The HTML matches the layout of recibo_Branca_marco_2026.pdf exactly:
  - Two-column header (employer left, employee right)
  - Info bar: NIF | Data Pagamento | Forma de Pagamento | Função
  - "NOTA DE REMUNERAÇÕES E DEDUÇÕES" + month/year
  - Two-panel side-by-side table (earnings left, deductions right)
  - Italic note paragraph with computed values
  - Summary table: EUR | Total Remun. | Desconto SS | Encargo SS | Total Pagar
  - Payment table: Forma de Pagamento | Valor a Transferir
  - Signature lines

Usage:
  python3 receipt.py <hours_worked> --year YYYY --month MM [--output path.pdf]

  Output format is determined by the file extension:
    .pdf  — generates a clean PDF via weasyprint (no browser headers/footers)
    .html — generates HTML (for inspection or manual printing)
  Default: print HTML to stdout.
"""

from __future__ import annotations

import argparse
import calendar
from datetime import date
from pathlib import Path

from salary import calculate_salary, format_currency

# ---------------------------------------------------------------------------
# Portuguese month names
# ---------------------------------------------------------------------------

PT_MONTHS = [
    "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


def _last_day(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _fmt(amount: float) -> str:
    """Format monetary amount as '528,71' (no € symbol, comma decimal)."""
    fc = format_currency(amount)   # e.g. "528,71 €"
    return fc.replace(" €", "")


# ---------------------------------------------------------------------------
# Empty rows to pad the side-by-side table
# ---------------------------------------------------------------------------

_EMPTY_ROW = (
    "<tr>"
    '<td class="left-cell">&nbsp;</td>'
    '<td class="quant-cell"></td>'
    '<td class="val-cell"></td>'
    '<td class="right-cell sep"></td>'
    '<td class="vbase-cell"></td>'
    '<td class="val-cell"></td>'
    "</tr>"
)


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------

RECEIPT_HTML = """\
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Recibo de Vencimento — {pt_month} {year}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: Arial, sans-serif;
      font-size: 11.5px;
      color: #222;
      margin: 32px 36px;
      max-width: 780px;
    }}

    /* Header */
    .header {{
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
    }}
    .employer-block {{ line-height: 1.6; }}
    .employer-block .name {{ font-size: 15px; font-weight: bold; }}
    .employee-block {{ text-align: left; line-height: 1.6; }}
    .employee-block .honorific {{ font-size: 11px; }}
    .employee-block .name {{ font-weight: bold; font-size: 12px; }}
    .divider {{ border: none; border-top: 1px solid #333; margin: 10px 0 8px 0; }}

    /* Info bar */
    table.info-bar {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 11px;
    }}
    table.info-bar th {{
      background: #e8e8e8;
      border: 1px solid #ccc;
      padding: 4px 8px;
      text-align: center;
      font-weight: bold;
    }}
    table.info-bar td {{
      border: 1px solid #ccc;
      padding: 4px 8px;
      text-align: center;
    }}

    /* Section heading */
    .section-heading {{
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }}
    .section-heading .title {{ font-weight: bold; font-size: 11.5px; }}
    .section-heading .month-year {{ font-weight: bold; font-size: 11.5px; }}

    /* Main two-panel table */
    table.main-table {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 11px;
    }}
    table.main-table th {{
      background: #e8e8e8;
      border: 1px solid #ccc;
      padding: 4px 6px;
      font-weight: bold;
    }}
    table.main-table td {{
      border: 1px solid #ccc;
      padding: 3px 6px;
      vertical-align: top;
    }}
    td.left-cell  {{ width: 36%; }}
    td.quant-cell {{ width: 7%;  text-align: center; }}
    td.val-cell   {{ width: 8%;  text-align: right; }}
    td.sep        {{ border-left: 2px solid #999; }}
    td.right-cell {{ width: 32%; }}
    td.vbase-cell {{ width: 9%;  text-align: right; }}
    th.sep        {{ border-left: 2px solid #999; }}

    /* Note paragraph */
    p.note {{
      font-style: italic;
      font-size: 10.5px;
      border: 1px solid #ccc;
      padding: 6px 8px;
      margin: 0 0 8px 0;
      line-height: 1.5;
    }}

    /* Summary table */
    table.summary {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 11px;
    }}
    table.summary th {{
      background: #e8e8e8;
      border: 1px solid #ccc;
      padding: 4px 6px;
      text-align: center;
      font-weight: bold;
    }}
    table.summary td {{
      border: 1px solid #ccc;
      padding: 4px 8px;
      text-align: right;
      font-weight: bold;
    }}
    table.summary td.eur {{ font-weight: bold; text-align: center; }}

    /* Payment table */
    table.payment {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 11px;
    }}
    table.payment th {{
      background: #e8e8e8;
      border: 1px solid #ccc;
      padding: 4px 8px;
      text-align: center;
      font-weight: bold;
    }}
    table.payment td {{
      border: 1px solid #ccc;
      padding: 4px 8px;
      text-align: center;
    }}
    table.payment td.amount {{ text-align: right; font-weight: bold; }}

    /* Signatures */
    .signatures {{
      margin-top: 32px;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
    }}
    .sig-block {{ line-height: 2.0; }}

    @page {{
      size: A4;
      margin: 18mm 16mm;
    }}
    @media print {{
      body {{ margin: 0; }}
    }}
  </style>
</head>
<body>

<!-- ===== HEADER ===== -->
<div class="header">
  <div class="employer-block">
    <div class="name">Clément Rouault de Coligny</div>
    NIF: 291628788<br>
    Rua Eduardo Coelho, 46 2D<br>
    1200-168 Lisboa
  </div>
  <div class="employee-block">
    <div class="honorific">Exmo(a). Senhor(a)</div>
    <div class="name">Branca Manuel Gaspar</div>
    NIF: 323404138
  </div>
</div>

<hr class="divider">

<!-- ===== INFO BAR ===== -->
<table class="info-bar">
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
      <td>323404138</td>
      <td>{payment_date}</td>
      <td>MBWay</td>
      <td>Empregada Doméstica</td>
    </tr>
  </tbody>
</table>

<!-- ===== SECTION HEADING ===== -->
<div class="section-heading">
  <span class="title">NOTA DE REMUNERAÇÕES E DEDUÇÕES</span>
  <span class="month-year">{pt_month} / {year}</span>
</div>

<!-- ===== MAIN TWO-PANEL TABLE ===== -->
<table class="main-table">
  <thead>
    <tr>
      <th>Designação</th>
      <th>Quant.</th>
      <th>Valor</th>
      <th class="sep">Designação</th>
      <th>V. Base</th>
      <th>Valor</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="left-cell">Salário Base</td>
      <td class="quant-cell">{hours_worked}h</td>
      <td class="val-cell">{base_salary}</td>
      <td class="right-cell sep">Seg. Social trabalhador (quota mensal)</td>
      <td class="vbase-cell">{base_salary}</td>
      <td class="val-cell">{ss_worker}</td>
    </tr>
    <tr>
      <td class="left-cell">Subsídio de Férias – 1/12 (provisão)</td>
      <td class="quant-cell">1 U</td>
      <td class="val-cell">{ferias}</td>
      <td class="right-cell sep">SS s/ subsídios: liquidado no mês do pagamento</td>
      <td class="vbase-cell"></td>
      <td class="val-cell"></td>
    </tr>
    <tr>
      <td class="left-cell">Subsídio de Natal – 1/12 (provisão)</td>
      <td class="quant-cell">1 U</td>
      <td class="val-cell">{natal}</td>
      <td class="right-cell sep"></td>
      <td class="vbase-cell"></td>
      <td class="val-cell"></td>
    </tr>
    <tr>
      <td class="left-cell">Pass Navegante (isento SS/IRS)</td>
      <td class="quant-cell">1 U</td>
      <td class="val-cell">{navegante}</td>
      <td class="right-cell sep"></td>
      <td class="vbase-cell"></td>
      <td class="val-cell"></td>
    </tr>
    <tr><td class="left-cell">&nbsp;</td><td class="quant-cell"></td><td class="val-cell"></td><td class="right-cell sep"></td><td class="vbase-cell"></td><td class="val-cell"></td></tr>
    <tr><td class="left-cell">&nbsp;</td><td class="quant-cell"></td><td class="val-cell"></td><td class="right-cell sep"></td><td class="vbase-cell"></td><td class="val-cell"></td></tr>
    <tr><td class="left-cell">&nbsp;</td><td class="quant-cell"></td><td class="val-cell"></td><td class="right-cell sep"></td><td class="vbase-cell"></td><td class="val-cell"></td></tr>
    <tr><td class="left-cell">&nbsp;</td><td class="quant-cell"></td><td class="val-cell"></td><td class="right-cell sep"></td><td class="vbase-cell"></td><td class="val-cell"></td></tr>
    <tr><td class="left-cell">&nbsp;</td><td class="quant-cell"></td><td class="val-cell"></td><td class="right-cell sep"></td><td class="vbase-cell"></td><td class="val-cell"></td></tr>
    <tr><td class="left-cell">&nbsp;</td><td class="quant-cell"></td><td class="val-cell"></td><td class="right-cell sep"></td><td class="vbase-cell"></td><td class="val-cell"></td></tr>
  </tbody>
</table>

<!-- ===== NOTE PARAGRAPH ===== -->
<p class="note">
  <em>Nota: SS calculado sobre salário base (regime horário).
  Quota trabalhador ({ss_worker}€) suportada pela entidade patronal.
  Encargo patronal: {ss_employer}€. Total SS mensal: {total_ss}€.
  SS sobre subsídios liquidado no mês do pagamento.</em>
</p>

<!-- ===== SUMMARY TABLE ===== -->
<table class="summary">
  <thead>
    <tr>
      <th style="width:6%"></th>
      <th>Total Remunerações</th>
      <th>Desconto SS Trabalhador</th>
      <th>Encargo SS Patronal</th>
      <th>Total a Pagar</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="eur">EUR</td>
      <td>{total_remuneracoes}</td>
      <td>{ss_worker}</td>
      <td>{ss_employer}</td>
      <td>{total_a_pagar}</td>
    </tr>
  </tbody>
</table>

<!-- ===== PAYMENT TABLE ===== -->
<table class="payment">
  <thead>
    <tr>
      <th>Forma de Pagamento</th>
      <th>Valor a Transferir</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>MBWay</td>
      <td class="amount">{total_a_pagar}</td>
    </tr>
  </tbody>
</table>

<!-- ===== SIGNATURES ===== -->
<div class="signatures">
  <div class="sig-block">
    O/A Trabalhador/a ___________________________ Branca Manuel Gaspar
  </div>
  <div class="sig-block">
    A Entidade Patronal ___________________________ Clément Rouault de Coligny
  </div>
</div>

</body>
</html>
"""


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

def generate_receipt(
    hours_worked: float,
    year: int,
    month: int,
    historical_base_salaries: list[float] | None = None,
) -> str:
    """Return the HTML receipt as a string."""
    b = calculate_salary(hours_worked, historical_base_salaries=historical_base_salaries)

    last_day = _last_day(year, month)
    payment_date = f"{last_day:02d}/{month:02d}/{year}"
    pt_month = PT_MONTHS[month]

    # Total SS mensal = worker + employer (informational)
    from decimal import Decimal, ROUND_HALF_UP
    total_ss = float(
        (Decimal(str(b["ss_worker"])) + Decimal(str(b["ss_employer"])))
        .quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    )

    # Format hours without trailing zeros for display (e.g. 91.95, not 91.95000)
    h = b["hours_worked"]
    # Remove trailing zeros but keep at least 2 decimal places if needed
    hours_str = f"{h:g}"  # removes trailing zeros, e.g. "91.95" or "80"
    if "." not in hours_str:
        hours_str = f"{h:.0f}"

    return RECEIPT_HTML.format(
        year=year,
        pt_month=pt_month,
        payment_date=payment_date,
        hours_worked=hours_str,
        base_salary=_fmt(b["base_salary"]),
        ferias=_fmt(b["ferias"]),
        natal=_fmt(b["natal"]),
        navegante=_fmt(b["navegante"]),
        ss_worker=_fmt(b["ss_worker"]),
        ss_employer=_fmt(b["ss_employer"]),
        total_ss=_fmt(total_ss),
        total_remuneracoes=_fmt(b["total_remuneracoes"]),
        total_a_pagar=_fmt(b["total_a_pagar"]),
    )


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

def generate_pdf(
    hours_worked: float,
    year: int,
    month: int,
    output_path: str,
    historical_base_salaries: list[float] | None = None,
) -> None:
    """Write a clean PDF receipt via weasyprint (no browser headers/footers)."""
    from weasyprint import HTML  # type: ignore[import]
    html = generate_receipt(hours_worked, year, month, historical_base_salaries)
    HTML(string=html).write_pdf(output_path)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Branca salary receipt (HTML)")
    parser.add_argument("hours_worked", type=float)
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument("--month", type=int, default=date.today().month)
    parser.add_argument(
        "--history",
        type=str,
        default=None,
        help="Comma-separated prior months' base salaries, e.g. 431.25,500.25,528.71",
    )
    parser.add_argument("--output", type=str, default=None, help="Output HTML file path")
    args = parser.parse_args()

    history = (
        [float(x) for x in args.history.split(",") if x.strip()]
        if args.history else None
    )

    if args.output:
        out = args.output
        if out.endswith(".pdf"):
            generate_pdf(args.hours_worked, args.year, args.month, out, historical_base_salaries=history)
        else:
            html = generate_receipt(args.hours_worked, args.year, args.month, historical_base_salaries=history)
            Path(out).write_text(html, encoding="utf-8")
        print(f"Receipt written to: {out}")
    else:
        html = generate_receipt(args.hours_worked, args.year, args.month, historical_base_salaries=history)
        print(html)


if __name__ == "__main__":
    main()
