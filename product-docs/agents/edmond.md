# Edmond — Finance

Edmond is your personal finance assistant.

## What problems it solves

- Monthly expenses go unreviewed because categorizing a bank export manually takes too long
- Housekeeper salary calculation is error-prone when done by hand
- Generating a compliant salary receipt every month is time-consuming
- Investment options don't get modeled because building the spreadsheet takes longer than the decision
- Savings rate is tracked inconsistently across months

## How to trigger it

Message **DantesLisboaBot** on Telegram.

---

## Workflows

### Monthly expense tracking

**Trigger:** Drop an ActivoBank Excel export into the chat (personal account or joint account).

**What happens:**
1. Edmond parses the export, identifies which account it's from, and auto-categorizes every transaction using learned patterns from previous months
2. For transactions with low confidence (under 90%), Edmond asks you to confirm the category: "LOJA XYZ €47.30 — Supermarket or Home?"
3. After categorization, Edmond produces a monthly summary

**What you get back:**
- Total expenses by category (personal vs. joint)
- Top 5 largest single expenses
- Month-over-month change per category
- Anomalies: categories significantly above their rolling average

**Storage:** Processed data and summaries are saved to Edmond's workspace for historical comparison.

---

### Housekeeper salary calculation

**Trigger:** Edmond sends a monthly reminder on the last day of the month asking for hours worked. Reply with the number of hours.

**What happens:**
1. Edmond reads the hours you provide
2. Looks up the base salary history from previous months
3. Runs the salary calculation script — never computes manually
4. Generates a PDF receipt

**What you get back:**
A PDF salary receipt sent to the chat for your review.

**After you confirm** ("ok", "aprovado", "confirmar"):
- The PDF is stored permanently
- The salary record is saved to history for future months' calculations

**Salary components calculated:**
- Base salary (hourly rate × hours worked)
- Holiday subsidy (1/12 of average base salary since employment start)
- Christmas subsidy (1/12 of average base salary since employment start)
- Monthly transport pass (flat amount, tax-exempt)
- Social security contributions (worker + employer shares — informational only, paid separately by you directly to the social security website)

**Rule:** Edmond never calculates salary by hand. Always runs the Python script. Always shows the receipt before saving.

---

### Investment scenario modeling

!!! note "Status: Deferred — requires 3+ months of expense data"
    This workflow activates once enough savings rate data is available from monthly expense tracking.

**Trigger:** "Model my investment options" or "how much will I have in 5 years if I invest X/month?"

**What you get back:**
Scenario comparisons across investment vehicles (pension funds, ETFs, government bonds, real estate) projecting capital at a target horizon, based on your actual monthly savings rate.

---

## Current limitations

- **No automated bank export import** — you drop the file into the chat manually each month.
- **Investment analysis deferred** — requires at least 3 months of tracked expense data to calculate a reliable savings rate.
- **Social security payments not automated** — Edmond calculates the amounts and shows them on the receipt, but you pay them directly on the social security website.
- **No real estate monitoring** — listing alert scanning is a planned future phase, not yet implemented.
