#!/usr/bin/env python3
"""
Ad-hoc query helper for finance.db.

Usage:
  python3 db_query.py "<SQL query>"
  python3 db_query.py --search "gennaro"
  python3 db_query.py --monthly-summary [personal|joint] [YYYY]
"""

import sqlite3
import sys
import json

DB_PATH = "/workspace/agent/finance/finance.db"


def run_query(sql, params=()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def main():
    if len(sys.argv) < 2:
        print("Usage: db_query.py '<SQL>'")
        print("       db_query.py --search <keyword>")
        print("       db_query.py --monthly-summary [personal|joint] [YYYY]")
        sys.exit(1)

    if sys.argv[1] == "--search":
        keyword = sys.argv[2] if len(sys.argv) > 2 else ""
        rows = run_query(
            "SELECT date, account, amount, description, category, subcategory "
            "FROM transactions WHERE description LIKE ? ORDER BY date",
            (f"%{keyword}%",)
        )
        print(f"Found {len(rows)} transactions matching '{keyword}':")
        for r in rows:
            print(f"  {r['date']} | {r['account']:8s} | {r['amount']:+8.2f} | {r['category']}/{r['subcategory']} | {r['description']}")

    elif sys.argv[1] == "--monthly-summary":
        account = sys.argv[2] if len(sys.argv) > 2 else None
        year_filter = sys.argv[3] if len(sys.argv) > 3 else None
        where = "WHERE 1=1"
        params = []
        if account:
            where += " AND account = ?"
            params.append(account)
        if year_filter:
            where += " AND year = ?"
            params.append(int(year_filter))
        rows = run_query(
            f"SELECT year, month, account, category, ROUND(SUM(amount),2) as total "
            f"FROM transactions {where} AND amount < 0 "
            f"GROUP BY year, month, account, category ORDER BY year, month, account, category",
            params
        )
        for r in rows:
            print(f"  {r['year']}-{r['month']:02d} | {r['account']:8s} | {r['category']:20s} | {r['total']:+10.2f}")

    else:
        sql = " ".join(sys.argv[1:])
        rows = run_query(sql)
        print(json.dumps(rows, indent=2, default=str))


if __name__ == "__main__":
    main()
