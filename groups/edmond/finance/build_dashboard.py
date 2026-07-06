#!/usr/bin/env python3
"""
Build a self-contained HTML expense dashboard from finance.db.

Mission: make the household aware of where money goes and how much it saves,
and surface unusual month-over-month swings.

Data model (matches Edmond's canonical logic):
  - Income   = the `income` table, summed per month (source of truth).
  - Spending = -SUM(amount) over ALL rows in `transactions` EXCEPT the INCOME
               category. Positive amounts are reimbursements / expense offsets
               and must be netted in (they reduce true spending).
  - Net / savings rate = income - spending.
  - Joint contribution = EUR 4500/month, split proportionally by each person's
    personal income (Clement vs Lola), per income_writer.py.

Re-run whenever new months land in the DB:
    python3 build_dashboard.py
Output: dashboard.html (open in any browser, shareable, no server needed).
"""
import sqlite3
import os
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "finance.db")
OUT = os.path.join(HERE, "dashboard.html")

JOINT_TARGET = 4500.0  # monthly joint-account contribution target

# Spending = everything that is not real income. The INCOME category inside
# `transactions` is internal transfers/offsets, tracked by the income table.
NOT_SPENDING = ("INCOME",)


def q(con, sql, params=()):
    return con.execute(sql, params).fetchall()


def build_model():
    con = sqlite3.connect(DB)

    tx_months = q(con, "SELECT DISTINCT year, month FROM transactions")
    in_months = q(con, "SELECT DISTINCT year, month FROM income")
    months = sorted({f"{y:04d}-{mo:02d}" for y, mo in list(tx_months) + list(in_months)})

    # --- income per month (source of truth) ---
    income = {ym: 0.0 for ym in months}
    for y, mo, tot in q(con, "SELECT year, month, SUM(amount) FROM income GROUP BY year, month"):
        income[f"{y:04d}-{mo:02d}"] = tot or 0.0

    # --- income per person per month (fairness split) ---
    per_person = {ym: {"Clément": 0.0, "Lola": 0.0, "Joint": 0.0} for ym in months}
    for y, mo, who, tot in q(con,
            "SELECT year, month, who, SUM(amount) FROM income GROUP BY year, month, who"):
        ym = f"{y:04d}-{mo:02d}"
        if who in per_person[ym]:
            per_person[ym][who] += tot or 0.0

    # --- spending per month: -SUM(amount) over all non-INCOME rows (both signs) ---
    spend = {ym: 0.0 for ym in months}
    for y, mo, tot in q(con,
            "SELECT year, month, SUM(amount) FROM transactions "
            "WHERE category IS NULL OR category != 'INCOME' GROUP BY year, month"):
        spend[f"{y:04d}-{mo:02d}"] = -(tot or 0.0)

    # --- spending per category per month (net; positive offsets reduce it) ---
    cat_month = {}
    for y, mo, cat, tot in q(con,
            "SELECT year, month, COALESCE(NULLIF(category,''),'UNCLASSIFIED') c, SUM(amount) "
            "FROM transactions WHERE category IS NULL OR category != 'INCOME' "
            "GROUP BY year, month, c"):
        cat_month.setdefault(cat, {})[f"{y:04d}-{mo:02d}"] = -(tot or 0.0)

    # --- biggest single outflows per month (anomaly context) ---
    big = {ym: [] for ym in months}
    for dt, desc, amt, cat in q(con,
            "SELECT date, description, amount, category FROM transactions "
            "WHERE amount < -300 AND (category IS NULL OR category != 'INCOME') "
            "ORDER BY amount ASC"):
        ym = dt[:7]
        if ym in big and len(big[ym]) < 8:
            big[ym].append({"date": dt, "desc": (desc or "")[:40],
                            "amt": round(amt), "cat": cat or "—"})

    n_tx = q(con, "SELECT COUNT(*) FROM transactions")[0][0]
    con.close()

    # --- derived: net & savings rate ---
    net = {ym: round(income[ym] - spend[ym]) for ym in months}
    rate = {ym: (round(100 * (income[ym] - spend[ym]) / income[ym]) if income[ym] > 0 else None)
            for ym in months}

    # --- category ordering, top-N + Other ---
    cats = list(cat_month.keys())
    cat_totals = {c: round(sum(v for v in cat_month[c].values() if v > 0)) for c in cats}
    order = sorted(cats, key=lambda c: -cat_totals[c])
    TOPN = 8
    top, other = order[:TOPN], order[TOPN:]
    stack = []
    for ym in months:
        row = {"m": ym}
        for c in top:
            row[c] = round(max(0.0, cat_month[c].get(ym, 0.0)))
        row["OTHER"] = round(sum(max(0.0, cat_month[c].get(ym, 0.0)) for c in other))
        stack.append(row)

    # --- anomalies: latest month vs trailing 3-month avg per category ---
    latest = months[-1]
    li = months.index(latest)
    prior = months[max(0, li - 3):li]
    anomalies = []
    for c in order:
        cur = max(0.0, cat_month[c].get(latest, 0.0))
        base_vals = [max(0.0, cat_month[c].get(m, 0.0)) for m in prior]
        base = sum(base_vals) / len(base_vals) if base_vals else 0.0
        delta = cur - base
        rel = (delta / base * 100) if base > 0 else (100 if cur > 0 else 0)
        if abs(delta) >= 150 and (base == 0 or abs(rel) >= 40):
            anomalies.append({"cat": c, "cur": round(cur), "base": round(base),
                              "delta": round(delta), "rel": round(rel)})
    anomalies.sort(key=lambda a: -abs(a["delta"]))

    # --- fairness split for latest month (Edmond's exact formula) ---
    def cents(v):
        return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    pp = per_person[latest]
    cle, lol = cents(pp["Clément"]), cents(pp["Lola"])
    ptot = cle + lol
    jt = cents(JOINT_TARGET)
    cle_share = cents(cle / ptot * jt) if ptot > 0 else Decimal("0")
    lol_share = (jt - cle_share) if ptot > 0 else Decimal("0")
    fairness = {
        "clement_income": float(cle), "lola_income": float(lol),
        "clement_share": float(cle_share), "lola_share": float(lol_share),
        "clement_pct": round(float(cle / ptot * 100)) if ptot > 0 else 0,
        "lola_pct": round(float(lol / ptot * 100)) if ptot > 0 else 0,
        "target": JOINT_TARGET,
    }

    return {
        "months": months,
        "income": {ym: round(income[ym]) for ym in months},
        "spend": {ym: round(spend[ym]) for ym in months},
        "net": net, "rate": rate,
        "cat_totals": cat_totals, "cat_order": order,
        "top_cats": top + (["OTHER"] if other else []),
        "stack": stack, "anomalies": anomalies,
        "latest": latest, "big_latest": big[latest],
        "fairness": fairness,
        "generated": date.today().isoformat(), "n_tx": n_tx,
    }


def main():
    model = build_model()
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(render(model))
    l = model["latest"]
    print(f"Wrote {OUT}")
    print(f"  {len(model['months'])} months · {model['n_tx']} transactions")
    print(f"  {l}: income €{model['income'][l]} · spend €{model['spend'][l]} · "
          f"net €{model['net'][l]} · rate {model['rate'][l]}%")


from dashboard_template import render  # noqa: E402

if __name__ == "__main__":
    main()
