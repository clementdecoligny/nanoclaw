# Lenny — Job Search PM

Lenny is a project manager for a time-boxed job search. It keeps the search
tracker (a Google Sheet) exact, prompts the daily and weekly rituals that would
otherwise be skipped, and starts each weekday with one concrete first action
against a real deadline. It talks to the owner only, on Telegram, and never
sends anything to anyone else. Recurring messages are short bullet lists — no
paragraphs — so they can be read at a glance on a phone.

The name is a tribute nickname to Lenny Rachitsky, whose podcast shaped the
owner's product career thinking. The agent never claims to be him.

## What problems it solves

- **Logging a call takes too long.** One call touches two or three tabs with
  formula columns, exact dropdown values and exact contact names. Lenny turns a
  voice note into the right rows in under a minute.
- **Rituals get skipped.** Without a prompt, the end-of-day log and the Friday
  review don't happen. Lenny asks, and files the answers.
- **Starting is the hard part.** Mornings are the focused window. A decided
  first action plus a milestone countdown creates the urgency that works.
- **Signals slip.** Follow-ups due, thank-yous owed and pivot-rule changes are
  surfaced every morning instead of at the monthly check.

## Workflows

| Workflow | When | What happens |
|---|---|---|
| Capture | Any voice note or message about a call | Conversations, Contacts and Pay log rows written; one-line echo per row; thank-you draft in chat |
| Morning nudge | 09:20 weekdays, always | First action (from yesterday's log), milestone countdown, due items, pivot-rule changes; Mondays: proposes the week's outcome goal |
| End-of-day prompt | 17:30 weekdays | Done / learned / tomorrow's first action → Daily log tab; proposes a Learning log line when a belief changed |
| Friday review | Fridays 12:00 | The charter's five questions one at a time, pre-filled from the week's data → Weekly review row |
| To-dos | Any time a to-do or status change is sent | Picks the phase and the outcome it serves, flags duplicates or to-dos that serve no outcome, echoes one line, writes to the phase's to-do list on OK; marks to-dos done, dropped or rescheduled the same way; reorders them on request ("put X first") |
| Adversarial review | On request | Three strongest reasons the plan might be wrong, with evidence; pivot-rule status; everyone met so far |

## Guardrails

- Writes go through one tool that is hard-wired to one spreadsheet (a test copy
  until the owner approves the switch to live). It only writes whitelisted input
  columns, into the first empty row (on phase tabs: only the to-do block), with dropdown values checked against the
  sheet's own rules. Formula columns, structure and settings are never touched.
- Other agents are blocked from the Sheets API at the credential gateway.
- The charter is mounted read-only.
- The sheet is the only record: calls, contacts, to-dos, resources, pay data and
  learnings all go there. Lenny's memory holds only his own bookkeeping (row
  references, last statuses). Anything with no place on the sheet is raised with
  the owner, never kept in memory instead.
- Lenny never decides a pivot, never writes the owner's core material (career
  positioning, pitches, interview answers) unless asked, and never invents data.

## Current limitations

- Outreach capture is not in v1 (planned when warm asks start).
- Company rows can't be created by the agent — an unknown company is written
  with a warning so the owner can add it.
- No holiday pause or quiet hours.
- Each phase holds at most 15 to-dos; more needs a manual sheet change.
- Each phase's to-do list is kept in priority order by a "#" column. A hand edit
  to "#" in the sheet is applied at the next write or the next morning nudge,
  not instantly.
- No separate resources list: a tool or link is saved as a to-do ("Try X for …")
  in the phase it helps, with the link in its notes.
