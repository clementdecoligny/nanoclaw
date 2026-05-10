# Income Tracking — Edmond Workload 1 Extension

## HMW

How might we give Clément and Lola a clear monthly income picture — including non-bank sources — so they know exactly how much each person contributes to the joint account that month?

## Solution hypothesis

Extend Workload 1 with an income step that runs **before** expense categorization. Edmond collects income lines interactively (manual entry per person), then computes each person's proportional contribution to the joint account target (€4,500/month). The output is a single `YYYY-MM-revenus.xlsx` with columns `Date | Who | Value | Type`, matching the structure of the historical income Excel. This surfaces income first and makes the joint-contribution split explicit before moving on to expenses.

## Non-goals

- No backfill of 18 months of historical income data (start fresh from next month)
- No automatic extraction of INCOME-category rows from bank statements into the income file (income is manual entry only)
- No change to expense categorization pipeline — bank rows categorized as INCOME stay as-is in the expense sheets
- No investment analysis integration (Workload 3 scope)
- No multi-currency support

## Income taxonomy

Derived from 18 months of historical data. Valid Type values:

| Type | Description |
|------|-------------|
| SALARY | Regular monthly net salary |
| FOOD | Subsidio de alimentacao (cartao de alimentacao — not in bank statement) |
| EDUCATION | School / training allowances |
| LICENCA | Parental leave pay (licença parental) |
| BONUS | One-off performance bonus |
| HOLIDAY | Holiday pay (subsídio de férias paid out as lump sum) |
| IRS | Tax refund (typically Joint) |

Who values: `Clément`, `Lola`, `Joint`

## Edge cases & decisions

| Edge case | Decision |
|-----------|----------|
| User provides income lines in any order / skips a person | Edmond accepts any order; asks "Lola a-t-elle aussi reçu un revenu ce mois ?" before closing income step |
| FOOD (subsidio de alimentacao) — variable amount | Edmond always asks the amount + who it applies to after collecting salaries |
| Joint account target not met by proportional split | Edmond flags: "Le total des revenus (€X) est inférieur à la cible de €4.500 — vous manquez €Y" |
| One person has €0 income (e.g. full licença month) | Valid; enter 0 for SALARY; Edmond asks to confirm explicitly before closing |
| Negative value entered | Rejected: "Un revenu ne peut pas être négatif — tu veux dire une dépense ?" |
| Duplicate entry (same Type/day/Who) | Edmond warns and asks to confirm before adding |
| Type not in taxonomy | Rejected; Edmond shows the valid list |
| User says "ok" before FOOD entered | Edmond always prompts for FOOD before finalising |
| User wants to correct after confirming | Not supported post-confirmation; restart with "recommencer les revenus" |
| File already exists for that month | Edmond warns: "Un fichier de revenus existe déjà pour YYYY-MM — écraser ?" |
| IRS refund arrives mid-month | Entered as Joint / IRS with the actual date |
| LICENCA and SALARY same month (partial month) | Both entered as separate rows on the same date |

## Entity model changes

None — income lives in flat files only.

## Session DB contract

None — pure container-side file I/O.

## Container boundary

None — all logic runs inside the container via Python script + CLAUDE.local.md instructions.

## API contract

### New script: `income_writer.py`

```
/opt/wpenv/bin/python3 /workspace/agent/finance/income_writer.py \
  --input /tmp/income.json \
  --output /tmp/YYYY-MM-revenus.xlsx
```

Input JSON (`/tmp/income.json`):
```json
{
  "year": 2026,
  "month": 5,
  "entries": [
    {"date": "2026-05-30", "who": "Clément", "value": 3898.63, "type": "SALARY"},
    {"date": "2026-05-30", "who": "Clément", "value": 183.60,  "type": "FOOD"},
    {"date": "2026-05-30", "who": "Lola",    "value": 2193.00, "type": "SALARY"},
    {"date": "2026-05-30", "who": "Lola",    "value": 234.00,  "type": "FOOD"}
  ],
  "joint_target": 4500.00
}
```

Output: `YYYY-MM-revenus.xlsx`
- Columns: `Date | Who | Value | Type` (matches historical file exactly)
- Sorted by date ascending, then Who alphabetically
- Summary rows appended below data (bold):
  - Total Clément / Total Lola / Total Joint / Grand total
  - Clément's share of joint (clément_total / grand_total × joint_target)
  - Lola's share of joint
  - Surplus (+) or shortfall (−) vs joint_target

### Edmond conversation flow — income step (runs before current Step 1)

1. Open income collection: "Avant de traiter les relevés, dis-moi les revenus de ce mois."
2. Ask for each income line per person in order: Clément first, then Lola, then Joint if any
3. After main salaries, always ask: "Et le subsidio de alimentacao — montant pour Clément ? Pour Lola ?"
4. Ask if any LICENCA, BONUS, HOLIDAY, EDUCATION, or IRS lines to add
5. Build `/tmp/income.json`
6. Run `income_writer.py`
7. Send `YYYY-MM-revenus.xlsx` via `send_document`
8. Show joint contribution split in chat (plain text summary)
9. Wait for confirmation ("ok", "confirme", etc.)
10. Save to `/workspace/agent/finance/historical/YYYY-MM-revenus.xlsx`
11. Continue with existing expense workflow (parse → categorize → …)

### Chat summary message format (step 8)

```
*Revenus — mai 2026*

• Clément : €4.082,23  →  part compte commun : €2.134,50
• Lola : €2.427,00  →  part compte commun : €1.269,00
• Joint : €0

Total : €6.509,23 — Objectif compte commun : €4.500,00
Excédent : +€395,50
```

If shortfall:
```
⚠️ Total revenus (€3.900) inférieur à l'objectif de €4.500 — manque €600.
```

## Affected files

| File | Change |
|------|--------|
| `groups/finance/finance/income_writer.py` | **New** — produces the income Excel |
| `groups/finance/CLAUDE.local.md` | **Updated** — income step inserted before Workload 1 Step 1; taxonomy section added |
| `docs/features/income-tracking.md` | This spec |

## Success signal

1. Month-start triggers. Edmond opens income collection before asking for bank exports.
2. Clément enters: Clément SALARY + FOOD, Lola SALARY + FOOD.
3. Edmond produces `2026-05-revenus.xlsx` with 4 data rows + summary showing proportional joint contributions. Flags shortfall if total < €4,500.
4. User confirms. File saved to `/workspace/agent/finance/historical/2026-05-revenus.xlsx`. Expense workflow proceeds.

## Implementation notes

_To be filled in after implementation._
