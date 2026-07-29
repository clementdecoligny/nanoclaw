# Coach — Cycling

Coach is a personal ultra-endurance cycling coach. It builds heart-rate-based
training plans, reviews completed activities from Strava, tracks progression
toward a target event, and explains the reasoning behind every session. All
interaction is in French, via Telegram.

Coach replaces a paid human road coach. The philosophy is deliberately different:
it trains endurance, resilience, and the ability to sustain effort over 24–72h —
not five-minute peak power.

## What problems it solves

- **No manual session planning in TrainingPeaks.** Coach owns the plan. Completed
  activities still sync automatically from Garmin to TrainingPeaks, but planning
  happens with Coach, not in TP.
- **Ultra-specific, HR-based sessions** — every session carries concrete heart-rate
  targets (bpm ranges from a lactate test), not vague "go easy" guidance.
- **Always available, always explains why** — training questions get an answer
  informed by ultra-endurance physiology, with the reasoning behind each session
  spelled out rather than handed down.
- **Nothing gets silently dropped** — skipped sessions, core-strength compliance,
  and load spikes are surfaced, not quietly forgotten.
- **Structured sessions land on the bike computer** — on request, Coach pushes the
  next session straight into Garmin Connect so it syncs to the Garmin device.

## How to trigger it

Message Coach on Telegram. Commands run immediately, without asking for
confirmation:

| Command | What it does |
|---------|--------------|
| `/today` | The day's session from the current weekly plan, in full session format |
| `/tomorrow` | Same, for the next day |
| `/weekly` | The full week's plan with per-session status (done / upcoming / missed) |
| `/done` | Pulls the latest Strava activity and returns structured feedback on it |

Plain requests work too — the Garmin push is triggered with something like
"pousse la prochaine séance sur mon Garmin".

## Workflows

### Macro periodization

Coach maintains a full periodization plan from now to the target event
(base → build → peak → taper), stored in its workspace. Weekly plans reference
the current phase and explain why the week looks the way it does. Coach proposes
macro-plan revisions when circumstances change — illness, a faster or slower
progression, a newly-added intermediate event — but **waits for approval** before
rewriting the plan.

### Weekly plan delivery

Every Sunday at 11:00 (French time), Coach delivers the week's plan on Telegram.
Sessions are structured — day, sport, total duration, objective, warmup / main
block / cooldown with HR zones, and a short "why this session now". Plans cover
cycling, running, swimming, and 2–3 core-strength sessions, and are built around
real weekly availability (rest day Saturday, swim Thursday, long session Friday)
and known season constraints like holidays or hiking trips.

### Activity review

After an activity shows up on Strava, Coach reviews it: duration, distance,
elevation, HR-zone distribution, actual vs. planned, what was good, what to
correct, and why. If an activity never reaches Strava, Coach assumes the session
did not happen — it does not guess.

### Progress tracking

Coach analyzes trends across weeks and months: weekly volume across all sports,
time-in-zone distribution, aerobic decoupling, HR drift on long rides, recovery
HR, and plan compliance. These feed an assessment of readiness for the target
event.

### Adaptive replanning

When Strava shows a session was skipped or done differently, Coach proposes
adjustments to the rest of the week and explains the trade-off.

### Automatic alerts

Coach raises these without being asked:

- **Overload** — weekly volume up more than 30% on the previous week.
- **Undertraining** — actual volume below 70% of planned for two consecutive weeks.
- **Zone drift** — HR at easy perceived effort trending down over 6+ weeks,
  suggesting it's time to retest zones.
- **Core strength** — zero core sessions in a week gets a firm reminder.

### Push a session to Garmin Connect (on-demand)

On request, Coach puts the next planned cycling session onto Garmin Connect,
scheduled to a date, with the exact per-step heart-rate targets. From there Garmin
syncs it to the bike computer automatically.

- **On-demand only.** Coach never pushes automatically — you ask, because you often
  adapt the plan.
- **You confirm first.** Coach shows the structured session (each step: duration +
  HR bpm range) and the target date, and waits for your OK before pushing.
- **Real HR ranges.** Each step carries a bpm min/max on the device — e.g. warmup
  95–106, main block 115–128 — not a generic zone.
- **Cycling only** for now. Rest days and non-cycling sessions are declined.
- **Duplicate guard.** If the session was already pushed, Coach flags it before
  pushing again.

Result: the workout appears in Garmin Connect scheduled for the chosen date and
syncs to the bike at the next sync. TrainingPeaks stays a passive sink for
completed activities — nothing is planned there.

## What it tracks

Coach keeps its own workspace records rather than relying on chat history: the
macro plan, the history of delivered weekly plans, a progress log of key metrics
and trends, sleep debt against a personal baseline, and freeform notes and
preferences.

## What it deliberately doesn't do

- **Nutrition planning** is out of scope for plans. Coach holds a reference
  nutrition plan from a separate nutrition coach and will discuss it **on request
  only** — it never injects nutrition into weekly or daily plans.
- **No gear or logistics advice.**
- **No autonomous macro-plan changes** — proposals only, approval required.
- **No power-based training** — heart rate only, no power meter.
- **It doesn't suggest races.** Intermediate events get folded into the
  periodization once you decide on them.

## Current limitations

- **One session per push** — Coach pushes the next single session, not a whole
  week at once.
- **Cycling only** — running, swimming, and core sessions are not pushed to Garmin.
- **No edit/delete from chat** — a wrongly pushed workout is fixed in Garmin Connect
  directly; Coach reports the workout ID when it pushes.
- **Unofficial Garmin integration** — the push uses an unofficial Garmin client
  authenticated from a token store seeded once on the host and mounted into the
  container. If Garmin changes its login flow, or the token expires, the push fails
  loudly with an auth error and the token has to be re-seeded on the host; Coach
  reports the error rather than failing silently or retrying in a loop.
- **Strava is the only source of truth for completed activities** — no upload means
  no session, as far as Coach is concerned.
