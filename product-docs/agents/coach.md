# Coach — Cycling

Coach is a personal ultra-endurance cycling coach. It builds heart-rate-based
training plans, reviews completed activities from Strava, tracks progression
toward a target event, and explains the reasoning behind every session. All
interaction is in French, via Telegram.

## What problems it solves

- **No manual session planning in TrainingPeaks.** Coach owns the plan. Completed
  activities still sync automatically from Garmin to TrainingPeaks, but planning
  happens with Coach, not in TP.
- **Ultra-specific, HR-based sessions** — every session carries concrete heart-rate
  targets (bpm ranges from a lactate test), not vague "go easy" guidance.
- **Structured sessions land on the bike computer** — on request, Coach pushes the
  next session straight into Garmin Connect so it syncs to the Garmin device.

## How to trigger it

Message Coach on Telegram. Common commands: `/today`, `/tomorrow`, `/weekly`,
`/done`, and — for the Garmin push — a plain request like "pousse la prochaine
séance sur mon Garmin".

## Workflows

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

Result: the workout appears in Garmin Connect scheduled for the chosen date and
syncs to the bike at the next sync. TrainingPeaks stays a passive sink for
completed activities — nothing is planned there.

## Current limitations

- **One session per push** — Coach pushes the next single session, not a whole
  week at once.
- **Cycling only** — running, swimming, and core sessions are not pushed to Garmin.
- **No edit/delete from chat** — a wrongly pushed workout is fixed in Garmin Connect
  directly; Coach reports the workout ID when it pushes.
- **Unofficial Garmin integration** — the push uses an unofficial Garmin client; if
  Garmin changes its login flow it can break until the client is updated, and Coach
  will report an auth error rather than fail silently.
