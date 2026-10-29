---
name: job-sheet
description: Read and write the Job Move 2027 Google Sheet (Conversations, Contacts, Pay log, Daily log, Learning log, Weekly review, Companies, phase to-dos). Use for every sheet read or write — never call the Sheets API directly.
---

# Job sheet tool

One CLI, one spreadsheet. The target (test copy or live) is fixed by the host; you cannot point it anywhere else.

```bash
S="bun /app/skills/job-sheet/sheet.ts"
$S read "<A1 range>"                       # e.g. "Dashboard!A4:B20", "Contacts!A2:H500"
$S rules "<tab>"                           # dropdown rules per column (list or range)
$S write "<tab>" <row-key> '<json cells>'
$S move "<phase tab>" row:N <position>     # put one to-do at # position; others shift
$S sort ["<phase tab>"]                    # renumber # 1…n and re-sort (no tab = all five)
```

Every command prints one JSON object. `"ok": false` means nothing was written — say so and keep the parsed row in chat to retry.

## Row keys

| Key | Use |
|---|---|
| `first-empty` | New record. Needs a value in column A (phase tabs: B Task). Never append. On phase tabs: first free to-do slot in rows 17–31, then lands last in # order. |
| `row:N` | Correct an existing record (row must already have its key column: A, or B on phase tabs). |
| `week:YYYY-MM-DD` | Weekly review only — any date in the week; resolves to its Monday row. |

## Writable columns (everything else is refused)

| Tab | Columns | Row keys |
|---|---|---|
| Conversations | A Date, B Contact, D Type, E CMF, F Verdict, G Learnings, H–J JSC Q1–Q3, K Follow-up, L Thank-you sent | first-empty, row |
| Contacts | A Name, B Company, C Type, D Warm/Cold, E Source, G Next action, H Next action date | first-empty, row |
| Pay log | A Date, B Source, C Role, D Company, E CMF, F Contract, G Base €, H Fixed allowances €, J Bonus €, K Equity, L Day rate € | first-empty, row |
| Companies | A Company, B Tier, C CMF fit, D Sector, E Type, F Location, G Guaranteed band max € (only after the owner says yes), I Status, J Notes. H is a formula — never | first-empty, row |
| Learning log | A Date, B I believed, C I learned, D I changed | first-empty, row |
| Daily log | A Date, B Done, C Learned, D Tomorrow's first action | first-empty, row |
| Weekly review | C Outcome goal override, D–H Q1–Q5 | week |
| `1 Set up` … `5 Close` (phase tabs) | To-do block only, rows 17–31: B Task, C Due, D Due basis, E Status, F Register, G Notes. A # is set only by `move`/`sort`; H sort key is a formula | first-empty, row (17–31 only) |

## Value rules (enforced)

- Dates: `YYYY-MM-DD`, real dates.
- Money columns: plain numbers (`110000`, not `110k` or `€110,000`).
- Dropdowns must match exactly — run `rules` if unsure.
- Conversations B must be an exact name from Contacts column A: create the contact first.
- Unknown company in Contacts B / Pay log D is written with a warning: relay it to the owner.
- Phase to-do Status (E): `Not started` · `In progress` · `Done` · `Dropped`. A full block (15 to-dos) returns an error: adding rows is a structural change.

## Phase to-do order (#)

- The block is always sorted by # (1…n, no gaps). Every phase-tab `write`, `move` and `sort` renumbers and re-sorts, and returns `order` (`index`, `row`, `task`) — **rows move**, so use the returned `row`, never an old one.
- Ties or a missing # (e.g. a hand edit) keep current row order; a new to-do goes last.
- If row 16 isn't `# | Task | Due | …` the tool refuses everything on that tab: the sheet needs a structural session.
- `""` clears a cell. Text may not start with `=`.
