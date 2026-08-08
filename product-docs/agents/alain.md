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

!!! note "Status: built, not yet populated"
    The structure and the workflow are in place. The knowledge base is empty
    until the first pass runs: Alain samples your calendar and inbox, proposes
    the topic categories he found, and waits for your approval before writing
    anything. Until then, every question returns "aucun événement enregistré".

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

**Structure.** The atom is a dated event, written once and never rewritten. The
day-by-day diary and the topic dossiers are *generated views* over that same
event log — so nothing is ever filed in one place, and the views cannot drift or
degrade because they are rebuilt from the events.

**Privacy:** the knowledge base is excluded from git and never leaves your
machine. It is not included in the nightly backup, by design — it holds full
medical detail.

---

## Current limitations

- **Second brain is derived-only** — it captures life that leaves a paper trail
  (bookings, appointments, school, purchases). A weekend at home that generated
  no email or calendar entry will be missing. This is deliberate: a system
  requiring manual capture gets abandoned.
- **Google Drive not connected** — the knowledge base draws on calendar and
  Gmail only. Drive is a planned source.
- **Knowledge base is not backed up** — excluded from the nightly push because it
  holds medical detail. A disk loss loses it.
- **Not authoritative** — Gmail, Calendar and Drive remain the source of truth;
  the knowledge base cites back to them.
- **No payment delegation** — Alain identifies what's due but never initiates payments.
- **No work systems access** — personal life only, by design.
