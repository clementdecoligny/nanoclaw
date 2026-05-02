# Alain — Executive Assistant

Alain is your personal executive assistant.

## What problems it solves

- Your inbox accumulates without a clear view of what needs action
- Invoices and payment deadlines get missed or require manual scanning
- Commitments and follow-ups live in your head instead of being tracked
- Drafting routine emails takes time you don't have
- Administrative tasks pile up with no proactive surfacing

## How to trigger it

Message **AlainLisboaBot** on Telegram.

---

## Workflows

### Inbox triage

!!! note "Status: Gmail integration not yet configured"
    This workflow requires completing the Gmail OAuth setup. Once active, Alain can read and summarize your personal inbox.

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

!!! note "Status: Calendar integration not yet configured"
    This workflow requires a Google Calendar MCP to be wired. Once active, Alain can read your calendar and propose events.

**Trigger:** "Block time for X" or "schedule a call with Y."

**What you get back:**
A proposed event with full details (title, date, time, attendees, description). Alain waits for explicit confirmation before creating anything.

---

## Current limitations

- **Gmail not yet authenticated** — inbox triage and email drafting are not active. Requires completing OAuth setup.
- **No calendar integration** — calendar reading and event proposals are deferred.
- **No payment delegation** — Alain identifies what's due but never initiates payments.
- **No work systems access** — personal life only, by design.
