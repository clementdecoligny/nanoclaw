---
name: job-sheet
description: Read and write the Job Move 2027 Google Sheet (Conversations, Contacts, Pay log, Daily log, Learning log, Weekly review, Companies band). Use for every sheet read or write — never call the Sheets API directly.
---

# Job sheet tool

One CLI, one spreadsheet. The target (test copy or live) is fixed by the host; you cannot point it anywhere else.

```bash
S="bun /app/skills/job-sheet/sheet.ts"
$S read "<A1 range>"                       # e.g. "Dashboard!A4:B20", "Contacts!A2:H500"
$S rules "<tab>"                           # dropdown rules per column (list or range)
$S write "<tab>" <row-key> '<json cells>'
```

Every command prints one JSON object. `"ok": false` means nothing was written — say so and keep the parsed row in chat to retry.

## Row keys

| Key | Use |
|---|---|
| `first-empty` | New record. Needs a value in column A. Never append. |
| `row:N` | Correct an existing record (row must already have column A). |
| `week:YYYY-MM-DD` | Weekly review only — any date in the week; resolves to its Monday row. |

## Writable columns (everything else is refused)

| Tab | Columns | Row keys |
|---|---|---|
| Conversations | A Date, B Contact, D Type, E CMF, F Verdict, G Learnings, H–J JSC Q1–Q3, K Follow-up, L Thank-you sent | first-empty, row |
| Contacts | A Name, B Company, C Type, D Warm/Cold, E Source, G Next action, H Next action date | first-empty, row |
| Pay log | A Date, B Source, C Role, D Company, E CMF, F Contract, G Base €, H Fixed allowances €, J Bonus €, K Equity, L Day rate € | first-empty, row |
| Companies | G Guaranteed band max € — only after the owner says yes | row |
| Learning log | A Date, B I believed, C I learned, D I changed | first-empty, row |
| Daily log | A Date, B Done, C Learned, D Tomorrow's first action | first-empty, row |
| Weekly review | C Outcome goal override, D–H Q1–Q5 | week |

## Value rules (enforced)

- Dates: `YYYY-MM-DD`, real dates.
- Money columns: plain numbers (`110000`, not `110k` or `€110,000`).
- Dropdowns must match exactly — run `rules` if unsure.
- Conversations B must be an exact name from Contacts column A: create the contact first.
- Unknown company in Contacts B / Pay log D is written with a warning: relay it to the owner.
- `""` clears a cell. Text may not start with `=`.
