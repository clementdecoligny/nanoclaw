#!/opt/wpenv/bin/python3
"""Parse an ActivoBank .xlsx export into JSON."""

import json
import argparse
import openpyxl
from utils import parse_date, parse_amount, find_description_header_row


def parse_file(file_path, account):
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active

    header_row = find_description_header_row(ws)
    headers = [str(c.value).strip() if c.value else "" for c in ws[header_row]]

    col = {}
    for i, h in enumerate(headers):
        hl = h.lower()
        if "lanç" in hl or "lanc" in hl:
            col["date"] = i
        elif "valor" in hl and "data" in hl:
            col["value_date"] = i
        elif "descri" in hl:
            col["description"] = i
        elif hl == "valor":
            col["amount"] = i
        elif "saldo" in hl:
            col["balance"] = i

    transactions = []
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        if all(v is None for v in row):
            continue
        desc = row[col["description"]] if "description" in col else None
        if not desc:
            continue
        transactions.append({
            "date": parse_date(row[col["date"]]) if "date" in col else None,
            "value_date": parse_date(row[col["value_date"]]) if "value_date" in col else None,
            "description": str(desc).strip(),
            "amount": parse_amount(row[col["amount"]]) if "amount" in col else 0.0,
            "balance": parse_amount(row[col["balance"]]) if "balance" in col else 0.0,
            "account": account,
            "category": "",
            "sub_category": "",
            "confidence": "",
        })

    return transactions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file_path")
    parser.add_argument("--account", choices=["personal", "joint"], required=True)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    transactions = parse_file(args.file_path, args.account)
    out = json.dumps(transactions, ensure_ascii=False, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out)
    else:
        print(out)


if __name__ == "__main__":
    main()
