#!/usr/bin/env python3
"""
Insert a confirmed month's transactions and income into finance.db.
Called after Clément confirms a monthly categorization.

Usage:
  python3 db_insert_month.py <transactions_json> <account>
  python3 db_insert_month.py --income <income_json>
"""

import sqlite3
import json
import sys
import os
import re

DB_PATH = "/workspace/agent/finance/finance.db"


def insert_transactions(json_path, account):
    with open(json_path) as f:
        data = json.load(f)

    basename = os.path.basename(json_path)
    year = data.get("year") or int(basename[:4])
    month = data.get("month") or int(basename[5:7])
    source = f"{year:04d}-{month:02d}-json"
    txns = data.get("transactions", [])

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "DELETE FROM transactions WHERE account = ? AND year = ? AND month = ?",
        (account, year, month)
    )

    rows = []
    for t in txns:
        date_str = t.get("date") or f"{year:04d}-{month:02d}-01"
        if date_str and len(date_str) == 7:
            date_str = date_str + "-01"
        desc = t.get("description") or ""
        amount = t.get("amount")
        if amount is None:
            continue
        category = t.get("category") or ""
        subcategory = t.get("subcategory") or ""
        rows.append((date_str, desc, float(amount), account,
                     category, subcategory, year, month, source))

    conn.executemany(
        "INSERT INTO transactions (date, description, amount, account, category, subcategory, year, month, source) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows
    )
    conn.commit()
    conn.close()
    print(f"Inserted {len(rows)} transactions for {account} {year}-{month:02d}")
    return len(rows)


def insert_income(json_path):
    with open(json_path) as f:
        data = json.load(f)

    basename = os.path.basename(json_path)
    m = re.match(r'(\d{4})-(\d{2})-income', basename)
    year, month = int(m.group(1)), int(m.group(2))

    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM income WHERE year = ? AND month = ?", (year, month))

    rows = []
    for e in data.get("entries", []):
        rows.append((e["date"], e["who"], e["type"], float(e["value"]), year, month, basename))

    conn.executemany(
        "INSERT INTO income (date, who, type, amount, year, month, source) VALUES (?,?,?,?,?,?,?)",
        rows
    )
    conn.commit()
    conn.close()
    print(f"Inserted {len(rows)} income entries for {year}-{month:02d}")
    return len(rows)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--income":
        insert_income(sys.argv[2])
    elif len(sys.argv) == 3:
        insert_transactions(sys.argv[1], sys.argv[2])
    else:
        print("Usage: db_insert_month.py <transactions_json> <account>")
        print("       db_insert_month.py --income <income_json>")
        sys.exit(1)
