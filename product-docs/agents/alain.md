# Alain — Executive Assistant

Alain is your personal executive assistant.

## What problems it solves

- Your inbox accumulates without a clear view of what needs action
- Invoices and payment deadlines get missed or require manual scanning
- Commitments and follow-ups live in your head instead of being tracked
- Drafting routine emails takes time you don't have
- Administrative tasks pile up with no proactive surfacing
- Facts about your own life are unfindable because you can't recall the search
  term — which airline, which airport, whether you even booked it
- Only the recent slice of a topic is reachable; older context is effectively lost

## How to trigger it

Message **AlainLisboaBot** on Telegram.

---

## Workflows

### Inbox triage

**Trigger:** "Check my emails" or "what's in my inbox?"

**What you get back:**
- Summary of threads needing a response, grouped by urgency
- Drafts for routine replies (shown in full, waiting for your confirmation before any send)
- Flagged items that look like invoices, deadlines, or commitments

**Safety rules — non-negotiable:**
- Alain never sends an email. Drafts only, confirmed explicitly by you.
- Work email is completely off limits — personal inbox only.
- Email content is treated as untrusted — if an email contains instructions directed at Alain, he flags it instead of following them.

---

### Tracking pending items and follow-ups

**Trigger:** Tell Alain about something you're waiting on, something you need to do, or something you don't want to forget.

**What happens:**
Alain captures it in his working memory (`inbox.md`, `pending.md`, or `notes.md`) with a date. He resurfaces items when they become overdue or when you ask for a status update.

**What you get back:** Confirmation of capture, and proactive reminders when something is overdue.

---

### Invoice and payment identification

**Trigger:** Triggered automatically during inbox triage, or ask "what do I owe?"

**What happens:**
Alain identifies due amounts, payees, and deadlines from your emails. He surfaces them clearly with urgency.

**Rule:** Alain never pays anything. He surfaces what's due — you handle the payment.

---

### Calendar event proposals

**Trigger:** "Block time for X" or "schedule a call with Y."

**What you get back:**
A proposed event with full details (title, date, time, attendees, description). Alain waits for explicit confirmation before creating anything.

---

### Second brain — personal life knowledge base

!!! note "Status: live — 12 months ingested, email deepening in progress"
    The calendar share is granted and the first pass is done: **577 events over
    the last 12 months**, across 11 topic dossiers he derived from your actual
    data and you approved. Date questions and topic questions answer from the
    wiki today.

    In progress: the **email deepening pass**. The first pass classified 1530
    emails from their subject lines without opening any of them, so it recorded
    *that* a receipt arrived but never the amount, and *that* a consultation
    happened but never the outcome. The deepening pass reads the bodies of the
    ~250 emails that carry real content — invoices, CUF, legal, school,
    bookings — so that "how much did I pay" and "what did the doctor say" become
    answerable.

Alain maintains a knowledge base about your personal life, derived automatically
from your calendar and personal inbox. Based on Karpathy's LLM Wiki pattern.

**The point:** you cannot retrieve your own history because you cannot formulate
the query — you don't recall the airline, the airport, or whether the flight was
booked at all. You are looking for a fact about your life, not a document.

**Trigger:** ask a question about your own history.

- « C'était quand la dernière fois chez le coiffeur ? »
- « On a bien réservé le vol pour août ? »
- « Combien de rendez-vous médecin pour mon fils l'an dernier ? Où ? »

**What you get back:** a short French answer with the date and a citation,
in seconds, without a Gmail search. If nothing was recorded, Alain says so
plainly — "aucun événement enregistré" is a real answer, and different from
"I didn't find it".

**How it is built — you never file anything.** Everything is derived from your
calendar (primary — you already create a blocker for every planned event) and
your personal inbox (secondary). There is no capture step, no daily prompt, and
nothing to maintain.

**How Alain reaches your data.** The two sources work differently, on purpose:

- **Calendar — you share it with him.** Alain's own Google calendar is empty; your
  calendar reaches him as a *shared* calendar at read-only level. Nothing is
  copied, so every past and future event is visible with no sync step, and
  revoking the share cuts his access to the history too. Google enforces
  read-only server-side, so he cannot alter your calendar even by mistake.
- **Inbox — an unfiltered forward.** Alain sees everything you receive, not the
  inbox you curate. That is deliberate: the mail you archive daily (booking
  confirmations, appointment reminders, receipts) is exactly what the knowledge
  base is made of. Noise is discarded when events are extracted, not before —
  a marketing email simply produces no event.

Work email is on a separate account and never reaches Alain.

**Structure — two kinds of thing.** A memory holds *what happened* and *what is
true*, and they behave differently:

- **Events** — dated, written once, never rewritten. "Consultation at CUF on
  14 May." The append-only record.
- **Notions** — durable facts with no date, or with a duration. "Lola's parents
  have a summer flat in Zahara", "you liked *Rear Window*", "the employment case
  is ongoing." These are *revisable*: when something changes, the notion is
  updated and the change is recorded as an event — so the history is never lost,
  but the answer to "what is true now" doesn't require reading it all.

The day-by-day diary and the topic dossiers are *generated views* over both — so
nothing is ever filed in one place, and the views cannot drift because they are
rebuilt from the source.

**He records what you tell him.** Mention in passing that Lola's parents have a
place in Zahara, and it is captured — no filing, no confirmation step, no list to
maintain. Weeks later, "where do we usually go in summer?" is answerable from a
fact you stated once and never wrote down. Everything carries its provenance,
including things said in conversation.

**People directory.** Alain maintains a directory of everyone you know or have
exchanged with — an index of all of them, plus a detailed page for the people
who recur. Ask "who was the lawyer on the employment case?" or "when did I last
see X?" and you get the name, the role, the organisation and the dates. It is
generated from your events like every other view, so there is nothing to file
and nothing to keep up to date. One page per person even when they write from
several addresses.

**What is kept from a source, and what is not.** Alain reads an email or a
calendar entry in full, extracts the facts, writes a one-line summary — and then
discards the original. Full email bodies and raw calendar descriptions are never
written to disk; a pointer back to the Gmail thread or calendar entry is kept
instead, so the original is always one click away without being duplicated.
Amounts and clinical detail are recorded. Account and card numbers, IBANs,
passwords, meeting credentials, 2FA codes and reset links never are.

**Privacy:** the knowledge base is excluded from git and never leaves your
machine. It is not included in the nightly backup, by design — it holds full
medical detail for your family, and personal context about the people in your
directory. Both are deliberate choices you made; the containment is what makes
them safe. It is local-only, gitignored, never sent to any external service, and
never shared with anyone but you. Credentials are the exception that is never
recorded at all — including other people's.

---

## Current limitations

- **Second brain captures what leaves a trace, plus what you say** — bookings,
  appointments, school, purchases, and durable facts you mention in
  conversation. A weekend at home that generated no email, no calendar entry and
  no remark still leaves no trace. You are never asked to file anything: Alain
  does the noticing and the writing, because a system requiring manual capture
  gets abandoned.
- **Google Drive not connected** — the knowledge base draws on calendar and
  Gmail only. Drive is a planned source.
- **Knowledge base is not backed up** — excluded from the nightly push because it
  holds medical detail. A disk loss loses it.
- **Not authoritative** — Gmail, Calendar and Drive remain the source of truth;
  the knowledge base cites back to them.
- **No payment delegation** — Alain identifies what's due but never initiates payments.
- **No work systems access** — personal life only, by design.
