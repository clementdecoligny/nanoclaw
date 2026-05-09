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

**Trigger:** On the 1st of each month, Edmond sends a reminder asking for the two ActivoBank exports (personal account + joint account). You upload both Excel files.

**What happens:**
1. Edmond parses both exports and runs exact-match categorization against 18+ months of labeled historical data — known merchants are categorized instantly with no Claude call
2. For new or unknown merchants, Edmond classifies them directly using the full category/sub-category taxonomy and the historical examples as context
3. New classifications are saved back to the lookup so they become exact matches next month

**What you get back:**
- Two Excel files — one per account — with `CATEGORY` and `SUB-CATEGORY` columns added for every transaction row
- Unclassified rows are highlighted in the file for easy review
- A brief summary: how many transactions were exact matches vs. newly classified

**Categories:** BABYSITTING · EAT OUT · EDUCATION · EMPREGADA · GROCERIES · HEALTH · HOLIDAY · HOUSE · KIDS · LEISURE · MOBILITY · RENT · VOITURE · CASH · FURNITURE · GIFT · MISC · UNCLASSIFIED

**Storage:** Learned classifications are persisted to the historical lookup, improving accuracy month over month.

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

- **Manual file upload** — Edmond asks for the files on the 1st of each month, but you still upload them manually via Telegram.
- **No analytics yet** — categorized data is returned as Excel files; monthly summaries and trend analysis are a planned follow-on feature.
- **Investment analysis deferred** — requires at least 3 months of tracked expense data to calculate a reliable savings rate.
- **Social security payments not automated** — Edmond calculates the amounts and shows them on the receipt, but you pay them directly on the social security website.
- **No real estate monitoring** — listing alert scanning is a planned future phase, not yet implemented.
