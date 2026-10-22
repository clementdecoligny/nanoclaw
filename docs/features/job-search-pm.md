# Job search PM agent ("Lenny")

Status: built on the test copy 2026-10-20 — awaiting owner review before switching to live. Source brief: "set up a NanoClaw project-manager agent for the Job Move 2027 search" (challenged 2026-10-20).

## HMW

How might we make sure every job-search conversation, daily log and weekly review lands correctly in the Job Move 2027 sheet in about 2 minutes of the owner's time — so the rituals they'd otherwise skip actually happen, no follow-up, thank-you or pivot signal slips, and each day starts with one concrete first action against a real deadline?

## Validated problems (why each feature exists)

| Feature | Problem | Evidence |
|---|---|---|
| Capture | Logging a call by hand touches 2–3 tabs with formula columns, exact dropdowns and exact contact names | Charter: 15–20 calibration calls in the Listening tour, 5 conversations/week target; pay log drives the 11 Dec gate and the pay-ceiling pivot |
| End-of-day prompt | Owner says they will skip the daily log without a prompt | Owner statement 2026-10-20 |
| Friday review prompt | Same — owner will skip it without a prompt | Owner statement 2026-10-20 |
| 09:20 nudge | Starting is the hard part; mornings are the focused window. A decided first action + a real deadline creates the urgency that has worked before | Owner statement 2026-10-20 (urgency, motivating goal) |
| Pivot-flip in nudge | "CMF mismatch" rule requires repositioning within 1 week — the monthly check is too slow | Charter §4 |
| Adversarial review (on demand) | Charter assigns the monthly adversarial review to "agent and council" | Charter §5 |

## Solution hypothesis

A dedicated Telegram agent group (`lenny`, own bot) with one narrow sheet tool. The tool reaches Google Sheets through OneCLI's Google Sheets OAuth app (no service-account key), is hard-wired to one spreadsheet ID, writes only whitelisted input columns into the first empty row of a tab, and validates dropdown values against the Settings tab. The agent turns free text or voice notes into rows, echoes one line, drafts the thank-you, runs three scheduled prompts (09:20 nudge, 17:30 end-of-day, Friday 12:00 review), and runs an adversarial review when asked. Success: from 1 Nov 2026 every call is logged by a voice note with no manual sheet editing, every weekday has a Daily log row, and every Friday has its Weekly review row filled.

## Scope (v1)

1. **Capture** → Conversations, Contacts, Pay log. Thank-you draft in chat.
2. **09:20 nudge** (weekdays, always sent):
   - Tomorrow's-first-action from last end-of-day log.
   - Countdown line from Dashboard: next milestone, gap, days left (e.g. "20 Nov: 5 recruiter calls — 0 done, 31 days").
   - Due items: overdue to-dos, follow-ups (Contacts H ≤ today), thank-yous owed (>24h, Thank-you sent blank).
   - Any pivot rule whose status changed since the previous nudge.
   - Mondays: propose the week's outcome goal (last week's Q5), ask to confirm/change → Weekly review C only if changed.
3. **End-of-day prompt** (weekdays 17:30): done / learned / tomorrow's first action → new **Daily log** tab. If "learned" contradicts an earlier belief, propose a Learning log line; write after confirmation.
4. **Friday review** (Fridays 12:00): Q1–Q5 one message at a time, Q1–Q2 pre-filled from Daily log rows of the week + Weekly review auto columns → Weekly review D–H. Propose a Learning log line from Q3.
5. **Adversarial review on demand**: three strongest reasons the current CMF/plan might be wrong, drawn from logged conversations; pivot-rule status with evidence; list of everyone met (for the JSC email draft). Never sends anything.
6. **To-dos any time** (added 2026-10-21): owner sends a to-do or a status change; the agent picks the phase, the outcome/gate it serves and checks duplicates itself, echoes one line, writes on OK to the phase tab's to-do block. Asks only when two phases fit, a duplicate is likely, or it serves no outcome (owner decides).

## Non-goals (v1)

- Outreach capture (add ~14 Dec when warm asks start), Companies tab writes except the confirmed band update (#7).
- Scheduled monthly pack, separate alert feature, holiday pauses, daily message cap, quiet hours.
- Changing the charter's daily rhythm.
- Gmail drafts, sending anything to anyone but the owner.
- Job boards, LinkedIn, calendar, company research, interview prep, Pipeline tab.
- Rewriting CMFs, 2-pager, pitches, interview answers unless asked.
- Deciding pivots (report signal + charter rule only).
- Any structural sheet change by the agent (tabs, formulas, Settings).

## Edge cases & decisions

| # | Edge case | Decision |
|---|---|---|
| 1 | Contact name near-match | Use existing name if exactly one clear match; if ≥2 plausible, ask one question |
| 2 | New contact, missing fields | Create row with known fields; blanks otherwise; no guessing |
| 3 | Value outside a dropdown | Map only when meaning is unambiguous; else blank + flagged in echo |
| 4 | Several people in one note | One Conversations row per person |
| 5 | No date given | Today; relative dates ("yesterday") resolved in group timezone |
| 6 | Pay given as a range | Base = low end; full range in the matching Conversations row's Key learnings (Pay log has no notes column) |
| 7 | Pay heard for a company | Echo proposes updating Companies G; write only on "yes" |
| 8 | Pay log M (net-equivalent) | Never written by the agent |
| 9 | Transcription garbles a name | Echo shows exactly the names written, so owner can correct |
| 10 | Correction after echo | Agent edits input cells of rows it wrote in the last 24h (row refs kept in memory) |
| 11 | Duplicate capture | Same date + contact exists → ask "update existing row?" |
| 12 | Thank-you confirmed | Set Thank-you sent = Yes on that contact's latest Conversations row |
| 13 | End-of-day prompt | 17:30 weekdays; one reminder next 09:20 nudge if unanswered |
| 14 | End-of-day answer arrives next morning | Written to the previous day's Daily log row |
| 15 | Friday review | 12:00 Fridays |
| 16 | Friday review abandoned midway | Save answers given; mention once in Monday's nudge |
| 17 | Morning nudge | 09:20 weekdays, always sent |
| 18 | Formula columns | Write tool rejects any column not in the whitelist (code-enforced, not prompt) |
| 19 | First empty row | Scan key column rows 2–500; error if none free; never `append` |
| 20 | Dates | Written `YYYY-MM-DD` with `USER_ENTERED` |
| 21 | Dropdown lists | Read from the target cell's own data-validation rule at each write (lists are inline, contact/company lists are ranges); invalid list value → refuse; unknown contact → refuse; unknown company → write with warning |
| 22 | Testing | All tests against a Drive copy; switch spreadsheet ID to live only after owner review |
| 23 | Structural changes | Done in Claude Code sessions with the owner (Daily log tab included), never by the agent |
| 24 | Charter | Host file `~/job-move-2027/charter.md`, mounted read-only |
| 25 | Contacting others | Never; drafts only |
| 26 | `cli_scope` | `group`; owner's Lenny identity is a group member, not a global owner; skills: agent-browser, onecli-gateway, welcome, job-sheet (no self-customize) |
| 27 | Timezone | Group setting `Europe/Lisbon`; switch to `Europe/Madrid` on the move (one field) |
| 28 | OneCLI Sheets scope is Drive-wide | Tool hard-codes the spreadsheet ID; any other ID is refused |
| 29 | Sheets API failure / OneCLI down | Agent says the write failed and keeps the parsed row in chat to retry; never partially reports success |
| 30 | Data in product docs | Roles only — no names, salary figures, family details |
| 31 | Phase to-do block | Rows 17–31 only (tables below it are protected); `first-empty` scans that window; full block → error, owner drops/merges or asks for a structural session |
| 32 | To-do due date | Owner's date (basis `Owner`) or the phase exit date (basis `Default`); never invented |
| 33 | To-do challenge | Agent decides phase/outcome/duplicate itself; one-line echo + OK before every write; asks only on ambiguity or no matching outcome |
| 34 | Sheet is the only record | Every job-search fact goes to a sheet tab; memory = agent bookkeeping only. No home → agent asks the owner, never parks it in memory |
| 35 | Resources | No Resources tab: a resource becomes a phase to-do ("Try/Use X for …") with links in G Notes, or a link on an existing to-do |
| 36 | To-do order (#) | Column A "#" on each phase to-do block (added 2026-10-21). Tool keeps # = 1…n and sorts the rows by it after every phase-tab write/move/sort; Done/Dropped keep their #; new to-do goes last. Lenny reorders on request (`move`, echo + OK) and runs `sort` before each morning nudge to apply hand edits. Dashboard next to-dos follow # (sort key H = # + row/10000, open only). Tool refuses phase tabs whose row 16 isn't the # header. Migration: `scripts/job-sheet/add-todo-index.ts <test\|live>` (idempotent), run on live at go-live |
| 37 | To-do status colours | Status cell: Not started light grey, In progress light yellow; Done = whole row light green (plus existing grey strikethrough). Overdue red row rule stays first so it wins. Same script, idempotent |
| 38 | Set up phase v2 (2026-10-22) | Owner's new outcome + gate: ≥3 calibration calls booked, company list v0 (~30, 6 h timebox), profile and resume live; council and CMF tests left the gate (council stays as Set up to-dos). Booked = Contacts G "Calibration call*" + held Recruiter/Product leader/Hiring manager conversations; Lenny replaces that next action once the call is logged. Company list = Companies rows ≥30. Applied by `scripts/job-sheet/set-up-phase-v2.ts <test\|live>` |

## Sheet contract

Writable columns (everything else refused):

| Tab | Key col | Writable |
|---|---|---|
| Conversations | A | A, B, D–L |
| Contacts | A | A–E, G, H |
| Pay log | A | A–H, J–L (M never) |
| Companies | A | G only, on confirmation |
| Learning log | A | A–D |
| Weekly review | row where A = Monday of the week | C (override), D–H |
| Daily log (new) | A | A–D (Date, Done, Learned, Tomorrow's first action) |
| `1 Set up` … `5 Close` | B, rows 17–31 only | B–G (Task, Due, Due basis, Status, Register, Notes); A # only via `move`/`sort`; H sort key never |

Reads: Dashboard ranges per brief §4; Settings dropdown lists row 39+.

New tab **Daily log** (built by us, with backup, before tests): header row, rows 2–500 empty, Date column formatted DD/MM/YYYY. No formulas.

## Entity model changes

None (new rows only): one agent group `lenny`, one messaging group (new Telegram bot), one wiring, container config (timezone, mount, cli_scope), 3 scheduled tasks.

## Session DB contract

None.

## Container boundary

- Read-only mount: `~/job-move-2027/` → `/workspace/extra/job-move-2027/`.
- Outbound HTTPS to `sheets.googleapis.com` via OneCLI gateway (Google Sheets app, OAuth).
- No new MCP tool in core; the sheet tool is a read-only container skill (`job-sheet`), enabled only for `lenny`. (The group folder is writable from the container, so a script there could be edited by the agent.)
- OneCLI block rules on `sheets.googleapis.com` for every other agent (Alain, Coach, Edmond, Pepa).

## API contract

Container skill `container/skills/job-sheet/` — `lib.ts` (pure rules, unit-tested), `sheet.ts` (CLI), `SKILL.md`. Target chosen by group env `JOB_SHEET_TARGET` (`test` default, `live`); no other ID reachable.

```
sheet read <range>                       → JSON values (FORMATTED_VALUE)
sheet rules <tab> [row]                  → JSON { col: {kind: list|range, values} }
sheet write <tab> <first-empty|row:N|week:YYYY-MM-DD> '{"A":"2026-11-03","B":"…"}'
                                         → JSON { target, ok, tab, row, written, warnings } | { ok:false, errors }
```

Rules enforced inside `write`: two known spreadsheet IDs only; tab + column whitelist; allowed row keys per tab (Companies `row` only, Weekly review `week` only); first-empty needs column A; `row:N` only on rows that already have column A; dropdown validation from the cell's own rule; real ISO dates; plain numbers in money columns; no leading `=`.

## Affected files

- `src/channels/telegram.ts` — register `telegram_lenny` (+ `TELEGRAM_BOT_TOKEN_LENNY` in `.env`).
- `groups/lenny/instructions.prepend.md` — standing rules (brief §3, decisions above).
- `container/skills/job-sheet/` (`lib.ts`, `lib.test.ts`, `sheet.ts`, `SKILL.md`).
- `groups/lenny/memory/` — agent bookkeeping only (row refs, last pivot statuses, nudge flags); no job-search facts.
- `product-docs/agents/lenny.md` — new page.
- Host: `~/job-move-2027/charter.md`, `RUNBOOK.md`.

## Build order

0. **Spike (gate for everything else):** connect Google Sheets in OneCLI; from a container, read Dashboard!B4 of the Drive copy through the gateway. If this fails, stop and revisit access.
1. Create Daily log tab on the copy (and later live) with backup.
2. Red tests for `sheet.ts` (whitelist, first-empty-row, dropdown, date, wrong ID) → green.
3. Bot + group + wiring + mount + timezone.
4. Capture; test with 5 notes (new contact, spelling variant, pay figures, duplicate, ambiguous). Check first empty row, formula count unchanged, dropdowns valid, Dashboard moved.
5. Schedules (09:20, 17:30, Fri 12:00); trigger each manually once.
6. Owner review → switch to live sheet. Target: live before 1 Nov 2026.
7. RUNBOOK.md + product-docs page.

## Success signal

Owner sends a voice note "Call with <recruiter> at <agency>, Ideal is a stretch, Principal in Madrid 110–120 base, follow up in 2 weeks" → within a minute: Conversations row (Recruiter, Ideal, Stretch, follow-up), Contacts row with Next action date +14d, Pay log row (Base 110000, range in the Conversations learnings), one-line echo, thank-you draft. No formula cell changed. Next weekday 09:20: nudge shows first action, milestone countdown, and the thank-you as owed if not confirmed.

## Naming

Agent name **Lenny** — a nod to Lenny Rachitsky, whose podcast shaped the owner's PM career thinking. A tribute nickname only: the agent never claims to be him, quotes him as if speaking for him, or uses his branding.
