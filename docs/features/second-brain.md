# Second Brain — Alain

Personal-life knowledge base for the Alain agent group, built on Karpathy's LLM
Wiki pattern with an event-log core.

Status: spec. Built via `/build` (Phases 0–1.5 complete).

---

## HMW

> How might we give Clément a personal knowledge base that answers questions
> about his life instantly and completely, holds the full history of each topic
> rather than just the recent slice, and accumulates into a record worth reading
> back with his family — built entirely from the paper trails his life already
> produces, without asking him to maintain it?

### The real problem

Discovery (Torres-style, grounded in past incidents) showed the failure is **not
search speed — it is query formulation.**

Clément's own examples:
- Flight tickets bought months ago: doesn't recall the airline, the airport, or
  *whether he or his wife booked them at all*.
- Barber: knows the visit happened, wants the date. Searches Calendar, fails.
- Doctor: "when was the last visit for my son", "how many times last year", "where".

He is not searching for a *document*. He is searching for **a fact about his own
history**. Gmail returns documents, which is why its results feel wrong to him.

Three distinct failures:
1. **Findability** — information scattered across Gmail, Drive, Calendar.
2. **Temporal decay** — only the recent slice of a topic is reachable (medical
   threads: knee, ear infection → hearing loss, the kids' pediatric history).
3. **No life record** — wants a history to read back, alone or with family.

### Prior art that matters

Clément and his wife kept a **paper 10-year diary** (one page per day, ten rows,
one line per year). Loved reading it back. **Abandoned it after ~2 years** —
daily discipline was unsustainable.

This is the single most important design input: any solution requiring him to
capture, file, or write **will fail, because it already has**. It also supplies
the target format for the diary view — one dense skimmable line per day, not
prose pages.

---

## Solution hypothesis

Alain maintains a persistent markdown knowledge base at `groups/alain/wiki/`
(mounted RW at `/workspace/agent/wiki/`), derived automatically from Google
Calendar (primary), personal Gmail (secondary), with Drive designed-for but out
of scope.

**The atom is a dated event.** Events are written once, append-only, never
rewritten. The day-by-day diary and the topic dossiers are both **generated
views** over the same event log.

This structure is chosen deliberately to dodge the *container problem* — the
"which page does this belong to?" filing decision that kills wikis of this kind
(see Research). If an event is never filed in exactly one place, the question
never arises.

**Success signal:** Clément asks "c'était quand le coiffeur ?" / "on a bien
réservé le vol ?" / "combien de rendez-vous médecin pour Tom l'an dernier ?" and
gets a correct, cited answer in seconds without any Gmail search.

### Priority (decides scope)

1. **Retrieval** — first priority. This is what gets built and proven.
2. **Diary accumulation** — second. It is a view over the same events, so it
   comes nearly free; it must **not** add scope or complexity to v1.

### Visual order is a requirement, not a nicety

Clément is a structured person — he needs his environment tidy and visually
organized, at home and here. This is part of *why* he wants the system, not just
a preference about its output.

Consequence: **the wiki must be pleasant for a human to open**, not merely
machine-navigable. Specifically:

- **Views are the human surface.** `jour/` and `dossiers/` are read by Clément
  and must be clean, aligned, and skimmable. `evenements/` is the machine layer;
  he should never need to open it.
- **Consistent shapes.** Same column order, same date format (`YYYY-MM-DD`), same
  section ordering on every page of a given kind. Predictability *is* tidiness.
- **Dense over sparse.** The 10-year diary worked because a year fit on a page.
  Diary views favour one tight line per day over prose paragraphs.
- **No visible clutter.** No half-finished pages, no orphan stubs, no `TODO`
  markers left in views. Lint treats visual mess as a real finding.

This is also an argument *for* the generated-view architecture: views are
rebuilt from the event log every pass, so they cannot rot into a messy drawer
the way hand-maintained notes do. The order is self-restoring — precisely the
property the paper diary lacked.

---

## Research findings that shaped this

| Finding | Source | Design consequence |
|---|---|---|
| Dominant failure mode is **over-engineering**, not bad tools; taxonomies abandoned within a month | practitioner reports; one case: 2,847 items captured / 84 read, −99.4% self-assessed ROI | Taxonomy stays minimal and **emerges from real data**. No predefined categories. |
| **Retrieval strategy determines how content should be built** | IBM Research / INTERACT 2025, Obsidian case study (arXiv 2509.20187) | Retrieval path designed first (event log + index); structure follows from it. |
| **The container problem** — topic-page aggregation recreates the folder-boundary problem that killed Evernote/Notion | Zettelkasten practitioner critique of this exact pattern | Event log + generated views, so no filing decision exists. |
| **Model collapse** — repeated LLM rewriting flattens detail, "average of the average" | same critique; unproven, nobody has run it long enough | Events are **append-only, never rewritten**. Views regenerate from events, never from a prior view. |
| Emergent benefit: periodic audit turns a passive archive into an active feedback loop | practitioner reports | Weekly pass includes lint, not just ingest. |

---

## Non-goals

- **No capture step, ever.** No daily prompt, no manual filing, no "tell Alain
  what happened". Derive-only. (The paper diary already failed this way.)
- **Not a complete life record.** Only paper-trail life is visible. Unrecorded
  life (a good weekend at home) will be missing. Stated limitation, not a defect.
- **No Google Drive in v1.** Source stubs stay source-agnostic so Drive can be
  added later without restructuring.
- **No migration of existing files.** `notes.md`, `inbox.md`, `movies.md`,
  `movies-pepe.md` and `memory/` are untouched. `memory/` serves conversational
  continuity — a different job the wiki does not replace.
- **No new host code.** No DB schema change, no new `ncl` verbs, no channel work.
- **Not authoritative.** Clément did **not** select "trust it as the record".
  Gmail/Calendar/Drive remain the source of truth; the wiki cites back to them.

---

## Architecture

```
groups/alain/wiki/            (mounted /workspace/agent/wiki/ — RW, local-only)
├── index.md                  entry point; read FIRST on every query
├── log.md                    append-only; ingest/query/lint entries + watermark
├── evenements/               THE ATOM — append-only, sharded by month
│   └── 2026-08.md
├── jour/                     VIEW: diary, one line per day (10-year-diary shape)
│   └── 2026-08.md
└── dossiers/                 VIEW: topic threads, generated from events
    ├── sante-tom.md
    ├── sante-clement-genou.md
    └── voyages.md

groups/alain/sources/         source stubs (source-agnostic shape)
└── gmail/ , calendar/
```

**Event record** (the only thing written directly):

```markdown
## 2026-08-12 | santé | Tom
Dr Silva (pédiatre), Lisboa — contrôle oreille
Diagnostic: otite moyenne résolue. Ordonnance: aucune.
confiance: haute
sources: gmail:18f2a9c4b1, calendar:abc123
```

Views are regenerated from these. Events are never edited — a correction appends
a new event that supersedes, keeping both (history is the point).

---

## Edge cases & decisions

| Edge case | Decision |
|---|---|
| Same event in both Calendar and Gmail | One event, two sources. Dedupe on date + type + entity. |
| Re-ingest of an already-processed window | Idempotent on `gmail_id` / calendar `event_id`. Safe to re-run. |
| Ambiguous or malformed source | Never dropped, never silently guessed. Recorded with `confiance: faible`. |
| "Did we even book it?" | Absence is a valid answer. Alain distinguishes *no event recorded* from *not found*. |
| Uncategorisable event | No fallback category needed — views are generated, so an uncategorised event stays fully retrievable. |
| Correction after the fact | Append superseding event; keep both with dates. |
| Crash mid-ingest | Per-source and resumable. `log.md` holds the watermark; at most one source is lost. |
| Scale (~100–200 events/month → ~2k/year) | Events sharded by month. `index.md` is the entry point. Escape hatch if index-only navigation stops scaling: `qmd`. |
| Timezone | `Europe/Lisbon` (install-wide, no group override). Event dates are **local** dates; ISO only in frontmatter. |
| Prompt injection | Email/calendar content is untrusted data, never instructions. Ingestion reads attacker-reachable text and writes to disk — highest-risk surface in this feature. Flag, never follow. |
| Ingestion triggering actions | Never. Ingest = read + file. No send, no calendar write, no acting on requests found in content. Existing approval rules unchanged. |
| Health detail | **Full clinical detail** recorded (diagnoses, results, prescriptions) — explicitly chosen; the knee/ear threads need it to be useful. |
| Health detail exposure | `scripts/backup-db.sh:33` runs `git add groups/` and pushes nightly. **`wiki/` and `sources/` are gitignored** — local-only, never pushed. Consequence: not covered by the nightly backup. |
| Work email | Off limits, unchanged from persona. Personal Gmail only. Separate Google account, nothing reaches the personal address — no mechanical exclusion needed. |
| Gmail forward is unfiltered, not the curated inbox | **Keep it.** The archived mail *is* the life-log material; curation would strip it. Noise filtered at extraction, not inbox. |
| Which calendar to read | Resolve by id from `list-calendars`. **Never `primary`** — that is Alain's own empty calendar. |
| Share not granted / later revoked | **Stop and report.** Never fall through to an empty `primary`, which is indistinguishable from a genuinely empty history. |
| Calendar id changes or share re-granted | Id cached in `index.md` is a hint, not truth. On zero events for a window that should have some, re-resolve before concluding absence. |
| Alain's token has calendar write scope | Harmless under reader-level sharing — Google refuses writes server-side. Safety comes from the share level, not the token. Do not raise the share to writer. |
| Events on Clément's calendar that are private/sensitive | Same rule as email: recorded like any other event. Full clinical detail is the explicit decision; wiki is local-only and gitignored. |
| DB boundary | **None.** No session DB read/write, no schema change. |
| Container boundary | **None.** No new message fields, no `on_wake`, no restart race. |
| Credentials | Unchanged. Existing Gmail + Calendar MCP servers. No new secrets. |
| `cli_scope` | Unchanged (`group`). Only `ncl tasks` for the scheduled pass. |
| Wiring / engage | Unchanged. |

---

## Source access model

The two sources reach Alain by **different mechanisms**, for a reason worth
recording: Gmail offers no read-grant for consumer accounts (delegation is
Workspace-only), so copying via forward was the only option. Calendar has native
sharing, so copying is unnecessary — and worse on every axis.

### Gmail — unfiltered forward (already in place, keep as-is)

Clément's personal Gmail forwards **everything** he receives, not the curated
inbox he triages daily. This is **correct and must not be "fixed"**:

- The curated inbox is optimised for *"what needs attention now"* — deletion-heavy
  and recency-weighted. The wiki needs the opposite: *"what happened, ever."*
- The mail he archives daily (flight confirmations, booking receipts, appointment
  reminders) **is precisely the life-log material**. Curating would strip it.
- Noise (newsletters, marketing, notifications) is filtered at **extraction**
  time, not inbox time: an email yields an event only if it records something
  that happened, on a date, involving Clément. A retail promo yields nothing.

No filter, no second account, no curation work by either party. If the discovery
pass reports a genuinely bad noise ratio, the extraction rule is tuned against
real numbers rather than a guess.

**Work email: non-issue.** Work is a separate Google account and none of it
reaches the personal address (confirmed 2026-08-08). The persona's "work email is
off limits" rule needs no mechanical enforcement — there is nothing to exclude.

### Calendar — share Clément's calendar with Alain's account

Alain's calendar MCP is authenticated against **his own** Google account, whose
calendar is empty. That is the entire gap: not missing history, but pointing at
the wrong calendar.

Chosen: **Clément shares his personal calendar with Alain's Google account
("See all event details").** Rejected alternatives and why:

| Option | Verdict |
|---|---|
| **Share (chosen)** | Read grant, not a copy. All 2+ years of history *and* every future event, with no sync process. Revocation is one click and retroactive — it cuts history too. Scoped per-calendar. |
| Bulk-copy (iCal export/import) | Point-in-time snapshot needing a sync mechanism that does not exist; iCal round-trips lose recurrences and invitees; creates a permanent duplicate of family medical history that survives revoking the original. |
| Re-auth Alain's MCP against Clément's account | Grants **write scope on the real calendar**. The "never create/edit/delete events autonomously" rule is prompt-level, and ingest means reading attacker-reachable email — exactly what prompt injection targets. Sharing removes the capability instead of relying on the rule. |

**Why the write scope is harmless under sharing:** Alain's calendar token carries
`calendar.events` (write), not just `calendar.readonly`. On a calendar shared at
*reader* level, Google refuses writes server-side regardless of token scope. The
safety comes from the share setting, not the token — worth knowing if the share
level is ever changed.

**Scope is clean:** personal calendar only. No shared family calendar, no work
calendar on the account (confirmed 2026-08-08), so there is no boundary to police.

### Calendar selection — the one behavioural change

The MCP defaults to `primary`, which is **Alain's own empty calendar**. After
sharing, Clément's calendar appears as an *additional* entry in the calendar list.
The skill must therefore:

1. Call `list-calendars` and select Clément's by id — **never assume `primary`**.
2. Record the resolved calendar id in `index.md` so later passes skip the lookup.
3. If it is absent (share revoked or not yet granted), **stop and say so** rather
   than silently ingesting an empty `primary` and reporting "aucun événement" —
   which would be indistinguishable from a genuinely empty history.

Point 3 is the failure mode worth guarding: without it, a broken share looks
exactly like a working system with nothing to report.

---

## Backfill

**Start at 12 months, extend later.** Clément's top-priority retrieval questions
are year-scale ("how many doctor visits for Tom last year"), which a 90-day window
could not answer. Calendar first (he creates placeholders for every planned event,
so it is already a hand-built life log), then Gmail.

Calendar history is **2+ years, continuous, same account** (confirmed 2026-08-08)
— deeper than this window. The limit is ingest cost, not data availability. Since
the event log is append-only and the watermark resumable, extending backwards
later costs nothing and requires no rework: prove retrieval on 12 months first,
then widen.

Ingest discipline: **one source at a time, fully integrated before the next.**
Batch-reading then bulk-writing produces shallow generic pages — the failure the
pattern exists to prevent.

---

## Discovery pass (before any ingest)

Taxonomy is **not predefined**. Alain samples broadly, clusters what is actually
there, proposes dossier topics to Clément, and **waits for approval** before
writing pages. Research says predefined taxonomies get abandoned; the categories
must come from real data.

---

## Container boundary

**None.** Everything lives in `groups/alain/` (host) ↔ `/workspace/agent/`
(container), already mounted RW at `src/container-runner.ts:331`. No host code
changes. The `wiki` container skill auto-mounts because Alain's `container.json`
has `"skills": "all"`.

## API contract

No new TypeScript types, no MCP tool changes, no `ncl` verbs.

Schema layer only:
- `container/skills/wiki/SKILL.md` — the maintainer instructions (ingest / query
  / lint / discovery).
- `groups/alain/instructions.prepend.md` — wiki block in marker comments.
  **Not** `groups/alain/CLAUDE.md`, which is composed at spawn and would be
  overwritten.

## Affected files

| File | Change |
|---|---|
| `.gitignore` | add `groups/alain/wiki/`, `groups/alain/sources/` |
| `container/skills/wiki/SKILL.md` | new — schema layer |
| `groups/alain/instructions.prepend.md` | wiki block in markers |
| `groups/alain/wiki/index.md`, `log.md` | new — scaffold |
| `docs/features/second-brain.md` | this spec |
| `product-docs/` | Alain page — new workflow |

## Success signal

Golden path: Clément asks Alain "c'était quand la dernière fois chez le coiffeur ?"
→ Alain reads `wiki/index.md`, locates the barber events, answers in French in
seconds with the date and a citation, without touching Gmail search.

Secondary: after the backfill, `wiki/jour/` contains a readable day-by-day record
of the last 12 months that Clément never had to write.

---

## Proactive surfacing

Deferred to a scheduled weekly pass (`ncl tasks`) — ingest new material, run
lint, send one French summary. Not part of the v1 build; added once retrieval is
proven.

---

# Pass 2 — Gmail deepening

Written 2026-08-08, after the initial ingest completed (577 events, 12 months).

## The problem

The first Gmail pass extracted **35 events from 1530 emails**. The ratio looked
like under-coverage. It is not — it is a **missing fetch step**.

`wiki/_gmail_meta_12mo.json` holds four fields per email: `id, subject, from,
date`. The pass classified all 1530 emails **from subject lines alone and never
opened a body**. `groups/alain/sources/gmail/` contains **zero stub files**,
though "Stubs de source" mandates one per ingested source.

Alain said so himself, in the event text:

```markdown
## 2026-01-31 | sante | Consultation(s) CUF — recibo(s) émis
2 reçus CUF reçus. Spécialité non identifiée depuis les métadonnées.
```

A subject line proves a receipt arrived. It cannot yield the amount, the payee,
the specialty, or the outcome. So every finance event reads "relevé mensuel"
with no figure, and every santé event reads "recibo(s) émis" with no clinical
content. **The wiki cannot answer "combien j'ai payé" or "qu'est-ce qui est
sorti de la consultation" because that data was never fetched.**

### Gmail is additive, not an echo of the calendar

Tested before committing to the pass — if Gmail merely duplicated the calendar,
deepening would buy nothing:

- **209 of 1530 (13.7%)** are calendar notifications (`Invitation:`, `Accepted:`,
  `Cancelled event:`). Genuine overlap, correctly excluded by dedupe.
- **1321 emails carry information the calendar does not have.**
- The transactional veins are almost entirely additive — counts before → after
  removing calendar notifications: invoices **73 → 73**, bookings **34 → 34**,
  deliveries **51 → 51**, school **26 → 26**, avocat **20 → 20**.
- **966 distinct threads, 153 multi-message.** A thread is a negotiation *with an
  outcome* — the calendar has no equivalent shape.

## Scope — the four dense veins (~250 emails)

Chosen over "everything non-calendar" (1321): most of the remainder is
newsletters and Vinted/OLX notifications that yield no event, and fetching them
dilutes the log while multiplying the injection surface for nothing.

| Vein | Emails | What a body adds that a subject cannot |
|---|---|---|
| Finance / recibos | 73 | Amount, payee, due date, reference. Today: "relevé mensuel", no figure. |
| Santé / CUF | 25 | Specialty, provider, diagnosis, result, amount. Today: "spécialité non identifiée". |
| Avocat | 20 | Positions, deadlines, what was sent and answered. Highest-stakes thread in the wiki. |
| École | 26 | Closures, payments, meetings, medical notes. **No dossier exists today.** |
| Réservations | 34 | Confirmation number, dates, property, cancellation terms. |

Multi-message threads (153) are **out of scope for this pass** — thread
reconstruction is a distinct extraction shape and is deferred to pass 3. Single
messages within those threads are still eligible if they fall in a vein above.

## Extraction contract

Non-negotiable, and the reason this pass needs a spec rather than a prompt:

**Read body → extract facts → write a one-line gist → discard the body.** The
body is never written to disk, not in an event, not in a stub, not in a view.
The `gmail_id` is the pointer back; the thread in Gmail stays the source of
truth. This is the existing "Stubs de source" rule — pass 2 is the first time it
is actually exercised, because pass 1 never fetched anything to violate it with.

Every fetched email produces exactly one stub in
`groups/alain/sources/gmail/YYYY-MM-DD-<slug>.md` (currently: zero exist). A
fetched email that yields no event still gets a stub, so the pass is idempotent
and re-runs skip it.

Amounts are recorded. **Full account numbers, card numbers, complete IBANs,
passwords, 2FA codes, tokens and reset links are not** — unchanged from the
existing rule. Payee + amount + date is the useful triple; the account it was
drawn on is not.

## Medical detail

**Full clinical detail** — diagnoses, results, prescriptions, amounts —
consistent with the standing decision (see "Health detail" above). This pass is
what turns `dossiers/sante.md` from a scheduling log into a medical timeline:
45 appointment titles today, with the clinical content sitting unfetched in 25
CUF emails. Confirmed 2026-08-08.

## Prompt injection — quarantine and report

This pass fetches ~250 attacker-reachable bodies, the largest injection surface
this system has. The standing rule (untrusted data, never instructions) is
unchanged; pass 2 adds the operational handling:

- Suspicious content is recorded as an event with `confiance: faible`, **never
  followed**, and the pass **continues**.
- Flagged items accumulate and are reported to Clément **in one batch at the end
  of the pass**, not one message per hit.
- Halting on first detection was rejected: a single marketing email with
  imperative phrasing would stall a 250-email run overnight, and a pass that
  reliably fails to finish gets abandoned.

Injection never changes what Alain does. Ingest remains read + file: no send, no
calendar write, no acting on a request found in content.

---

# Fix — verbatim calendar descriptions on disk

Found in the same audit. Independent of pass 2, and smaller.

The initial ingest copied calendar `description` fields **verbatim** into events
and dossiers. In `dossiers/sante.md`:

```
Teleconsulta MGF — Clément Rouault De Coligny - JMS37913792
  Caro(a) Clément Rouault De Coligny,<br>5 minutos antes da hora marcada, deve
  aceder à plataforma da teleconsulta para fazer a admissão administrativa
```

Audit result: **14 `<br>`-bearing verbatim descriptions** across 7 files, **52
description lines over 110 characters**, and **3 identifiers** on disk —
`JMS37913792` (CUF patient reference), `FID628238`, `FID628241`.

Two distinct faults:

1. **Rule gap.** "Jamais le corps complet" was written for Gmail. Nothing said
   the same applies to calendar descriptions, so it was applied to neither.
2. **Visual mess.** Raw `<br>` and boilerplate in a generated view — a direct
   violation of "Visual order is a requirement", which exists because a messy
   view stops being opened.

Fix: same gist rule as email — a calendar description is summarised to at most
one line, or dropped when it is pure boilerplate ("5 minutos antes da hora
marcada..."). Identifiers are stripped. Existing events are **corrected in
place** rather than superseded: the append-only rule protects the historical
record from rewriting, and it does not oblige keeping a leaked identifier on
disk. This is the one sanctioned exception, and it is logged in `log.md`.

## Affected files — pass 2

| File | Change |
|---|---|
| `container/skills/wiki/SKILL.md` | Gmail deepening pass; calendar-description gist rule; injection batch-report |
| `src/second-brain-wiki.test.ts` | tests for the fetch-and-gist contract and the description rule |
| `groups/alain/wiki/**` | corrected events/views; new `dossiers/ecole.md`; stubs in `sources/gmail/` |
| `docs/features/second-brain.md` | this section |
| `product-docs/agents/alain.md` | second-brain workflow update |

## Success signal — pass 2

Golden path: Clément asks **« combien j'ai payé à CUF cette année ? »** or
**« qu'est-ce que le médecin a dit pour Inés en mai ? »** → Alain answers from
the wiki with figures and clinical content, citing `gmail_id`s, without a Gmail
search.

Secondary: `dossiers/finance.md` carries amounts rather than "relevé mensuel";
`dossiers/sante.md` carries outcomes rather than appointment titles;
`dossiers/ecole.md` exists; `sources/gmail/` is no longer empty.

Negative signal (the pass failed even if it ran): any full email body on disk,
any surviving `<br>`, or a finance event still reading "relevé mensuel" with no
figure.

---

# Pass 3 — People directory

Requested 2026-08-08: a directory of everyone Clément knows or has communicated
with.

## Why this is a different shape

Everything in the wiki so far is a **dated event**. A person is not an event —
it is a durable entity that accumulates across events. This is the first thing
in the wiki with an identity that persists.

It stays consistent with the architecture by being a **generated view**, exactly
like `jour/` and `dossiers/`: the events remain the atom, and a person page is
rebuilt from every event mentioning them. Nothing is filed by hand; the "which
page does this belong to" question still never arises.

## Form — one index, fiches on demand

`personnes.md` is a single table: name, role/organisation, first contact, last
contact, interaction count, dossiers touched. Scannable in one screen.

`personnes/<slug>.md` is written **only for recurring people** — a threshold of
roughly 3+ interactions, or anyone central to an active dossier (the legal team
during the despedimento, for instance, regardless of count). One-off contacts
live as a row in the index and nothing more.

Rejected: a fiche per person from the start. 45 people today, most with a single
interaction, would produce 45 files of one line each — the "no half-finished
pages, no orphan stubs" rule in reverse, and unreadable as a directory.

## Scope — real people only

A real person is a human with whom a **genuine exchange** happened: a reply
thread, a shared appointment, or a named mention inside an event. Excluded:
newsletters, `no-reply@`, notification senders, marketplace relay addresses
(`messagerie.leboncoin.fr`), and transactional senders.

Organisations are **not** directory entries. They already exist as dossiers
(`avocat`, `ecole`, `sante`), and a person's fiche records their organisation as
an attribute. CUF is not a person; Madalena Moreira is, and her fiche says
Pares Advogados.

## What the sources can actually support

Measured 2026-08-08, before building:

- **45 real people** are recoverable from Gmail metadata alone (reply threads,
  after filtering machines and forward artifacts) — Vasco Alves, Helena Sá
  Machado, the Pares Advogados team, João Barroso, Filipa Mayer, the school.
- **Sender identity is unreliable from metadata.** The unfiltered forward
  rewrites the envelope: `clementdecoligny@gmail.com` appears as the *sender* of
  90 replies across 57 threads. Alain can tell which addresses appear in a
  thread, not reliably who wrote what. Bodies (`To:`, `Cc:`, signatures) are
  what disambiguate — so this pass **depends on pass 2** and must run after it.
- **Calendar attendees were never fetched.** `_cal_events_processed.json` keeps
  only `date, time, title, location, description, dossier, event_id`; the entire
  12-month cache holds 12 `@` characters. Attendee lists across 694 events — the
  single best "who was I with" source — are still in Google Calendar, unread.
  Same root cause as the email bodies in pass 2.

**Consequence: a re-fetch of calendar attendees is part of this pass**, not a
later refinement. Without it the directory is email-only and misses everyone
Clément sees in person but does not email.

## Third-party content — rule change

The existing rule forbade "contenu privé de tiers sans rapport avec les affaires
de Clément". **Clément explicitly widened this on 2026-08-08**, after being shown
the trade-off: person fiches record whatever the sources contain about that
person, including personal context, not only the parts touching his own dealings.

Recorded as a deliberate decision with its consequences stated:

- The wiki becomes a file on identifiable third parties who have not consented.
  It was already sensitive (family clinical detail); this widens *whose* data it
  holds, not just how much.
- Mitigation is unchanged and already in force: `wiki/` and `sources/` are
  gitignored, excluded from the nightly backup, local-only, and never sent to
  any external service or any person other than Clément.

**What remains excluded, unchanged** — these are not third-party-privacy rules
but credential and boundary rules, and pass 3 does not touch them:

- Account/card numbers, IBANs, passwords, 2FA codes, tokens, reset links —
  including those belonging to third parties.
- **Work email content.** See below.

### Work domain is not an exception

8 emails in the personal corpus touch `daimlertruck.com` — HR threads about
parental leave dates and adding his wife to MEDIS insurance. These are *personal
matters* that happen to route through the work domain.

Decision: **the person and the fact are recorded; the work-email content is
not.** An HR contact appears in the directory with role and organisation, and
the personal fact ("congé parental confirmé du X au Y", "épouse ajoutée à MEDIS")
becomes an event. The thread content does not land on disk. The work-email
boundary is a standing rule from the persona and pass 3 does not relax it — the
third-party widening above applies to private individuals, not to the work
account.

## Identity resolution

The directory's real difficulty is not extraction but **deduplication**. Already
visible in the data:

- Two addresses, one person: `darocalola@gmail.com` and `lola.daroca@edp.pt`.
- Display-name variants: `Lola Daroca` / `LOLA DAROCA`; `Filipa Mayer` at both
  `pilates.filipamayer@` and `pilates.marcar@`.
- Role accounts that are not a person: `tblx_peopleops@`, `secretaria@`.

Rules: one fiche per **human**, listing every known address. Merge on strong
evidence (same display name, or a signature naming the same person); never merge
on a weak signal such as a shared surname. When uncertain, keep them separate
with `confiance: faible` and a note — a wrong merge is worse than a missed one,
because it silently attributes one person's history to another.

Clément and Lola are **household members**, not directory entries in the usual
sense: they appear in nearly every event, so a fiche listing "interactions" is
meaningless for them. Record them once with their addresses so identity
resolution works, and exclude them from the interaction ranking.

## Affected files — pass 3

| File | Change |
|---|---|
| `container/skills/wiki/SKILL.md` | people-directory operation; identity resolution; third-party rule change; calendar attendee re-fetch |
| `src/second-brain-wiki.test.ts` | tests for scope, dedup, work-email boundary, generated-view discipline |
| `groups/alain/wiki/personnes.md` + `personnes/` | new — index and recurring fiches |
| `docs/features/second-brain.md` | this section |
| `product-docs/agents/alain.md` | directory workflow |

## Success signal — pass 3

Golden path: **« C'est qui déjà l'avocate sur le dossier laboral ? »** → Madalena
Moreira dos Santos, Pares Advogados, first contact January 2026, last exchange
July 2026, with the thread cited. And: **« Quand j'ai vu Vasco pour la dernière
fois ? »** answered from his fiche.

Secondary: `personnes.md` lists ~45 people rising materially once calendar
attendees are fetched; no newsletter or `no-reply@` address appears anywhere in
it; Lola has exactly one fiche despite two addresses.
