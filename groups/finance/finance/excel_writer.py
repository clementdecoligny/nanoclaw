#!/opt/wpenv/bin/python3
"""Write categorized transactions back to .xlsx with CATEGORY and SUB-CATEGORY columns."""

import json
import argparse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

HEADER_FILL = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True)
CAT_FILL = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
UNCLASSIFIED_FILL = PatternFill(start_color="FFE0CC", end_color="FFE0CC", fill_type="solid")

HEADERS = ["Data Lanç.", "Data Valor", "Descrição", "Valor", "Saldo", "CATEGORY", "SUB-CATEGORY"]
CAT_COLS = {"CATEGORY", "SUB-CATEGORY"}


def write_xlsx(transactions, output_path, account):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Personal" if account == "personal" else "Joint"

    ws.append(HEADERS)
    cat_col_indices = [i + 1 for i, h in enumerate(HEADERS) if h in CAT_COLS]

    for col_idx, _ in enumerate(HEADERS, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    for t in transactions:
        ws.append([
            t.get("date", ""),
            t.get("value_date", ""),
            t.get("description", ""),
            t.get("amount", 0.0),
            t.get("balance", 0.0),
            t.get("category", "UNCLASSIFIED"),
            t.get("sub_category", ""),
        ])

        row_idx = ws.max_row
        if t.get("category", "UNCLASSIFIED") == "UNCLASSIFIED":
            for col_idx in range(1, len(HEADERS) + 1):
                ws.cell(row=row_idx, column=col_idx).fill = UNCLASSIFIED_FILL
        else:
            for col_idx in cat_col_indices:
                ws.cell(row=row_idx, column=col_idx).fill = CAT_FILL

    widths = [12, 12, 50, 10, 12, 20, 20]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    wb.save(output_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("transactions_json")
    parser.add_argument("--output", required=True)
    parser.add_argument("--account", choices=["personal", "joint"], required=True)
    args = parser.parse_args()

    with open(args.transactions_json, encoding="utf-8") as f:
        data = json.load(f)

    transactions = data if isinstance(data, list) else data.get("transactions", [])
    write_xlsx(transactions, args.output, args.account)


if __name__ == "__main__":
    main()
