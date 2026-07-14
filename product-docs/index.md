# NanoClaw

A personal AI assistant system — a small team of specialized agents, each owning a distinct area of life, all reachable via Telegram.

## The idea

Instead of one general-purpose assistant that knows a little about everything, NanoClaw runs multiple focused agents. Each agent has deep expertise in one domain, its own memory, and its own set of tools. You message the right bot for the job.

## The agents

| Agent | Bot | What it handles |
|-------|-----|-----------------|
| [Pepa](agents/pepa.md) | PepaLisboaBot | Family meal planning, grocery ordering, batch cooking |
| [Alain](agents/alain.md) | AlainLisboaBot | Personal executive assistant — inbox, schedule, admin follow-ups |
| [Edmond](agents/edmond.md) | DantesLisboaBot | Personal finance — expense tracking, salary management, investments |
| [Coach](agents/coach.md) | Coach | Ultra-endurance cycling — HR-based training plans, activity review, Garmin push |

## How it works

Each agent runs in an isolated container with its own workspace, memory, and credentials. They don't share context — messaging Edmond won't surface anything from Pepa's meal plans.

All interaction is through Telegram. Send a message to the right bot and the agent picks it up within seconds.

## What this system doesn't do

- It doesn't replace decisions — agents surface, draft, and propose. You confirm.
- It doesn't act on work email or work systems — personal life only.
- It doesn't send emails, create calendar events, or make payments autonomously — all actions require explicit confirmation.
