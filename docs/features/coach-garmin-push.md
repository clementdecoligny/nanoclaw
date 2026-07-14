# Coach — Push session to Garmin Connect (on-demand)

## HMW

How might we let Clem get his next planned cycling session — with exact HR
interval targets — onto his Garmin bike device without ever touching
TrainingPeaks for planning, while keeping him in full control of *which* session
gets pushed and *when*?

## Solution hypothesis

Coach gains an on-demand capability: when Clem says "pousse la prochaine séance
sur mon Garmin" (or equivalent), Coach (1) reads the current weekly plan, (2)
identifies the next upcoming session, (3) converts it into a structured JSON
(ordered steps, each with a step type, a duration, and a custom HR **bpm range**
— the exact targets from the plan), (4) shows Clem the structured session +
inferred target date and **waits for his confirmation**, then (5) runs a Python
script that authenticates to Garmin Connect (token cached on disk), builds a
`CyclingWorkout` from the JSON, uploads it, and schedules it to the target date.
Garmin Connect then syncs the scheduled workout to Clem's bike device
automatically. TrainingPeaks stays purely a passive Garmin→TP sink for completed
activities — it is never used for planning here.

Success signal: Clem messages "pousse la séance de demain sur Garmin", Coach
replies with the structured session (steps + bpm ranges + duration + date) and
asks to confirm; on "ok", the script returns a Garmin workout ID + scheduled
date, and the workout appears on Garmin Connect scheduled for that date with the
correct per-step HR bpm ranges (not pace, not generic zones).

## Non-goals

- **Not automatic.** Coach never pushes without an explicit request + confirmation.
- **No power targets.** HR bpm ranges only (Clem has no power meter). Any power
  field in existing `.zwo` artifacts is ignored.
- **No TrainingPeaks planning integration.** TP remains a passive sink for
  completed activities via Garmin→TP sync. Nothing in this feature writes to TP.
- **No macro/weekly plan generation changes.** This consumes the existing weekly
  plan; it does not change how plans are made.
- **No host-side changes.** No new `ncl` verbs, no DB schema, no session-DB
  contract, no router/delivery changes. Entirely container + coach group.
- **No multi-session batch push** (initially). One session per request. ("Push
  the whole week" is a possible later extension, explicitly out of scope now.)
- **No run/swim/core push.** Cycling only for v1 (the device that matters is the
  bike Garmin). Structure allows extension but it's not built.
- **No editing/deleting already-pushed workouts** from chat (v1). If a wrong one
  is pushed, Clem fixes it in Garmin Connect. (Script returns the workout ID so a
  later `--delete <id>` extension is trivial.)

## Edge cases & decisions

| # | Edge case | Decision |
|---|-----------|----------|
| 1 | Ambiguous "next session" | Coach reads the most recent `weekly-plans/` file, picks the next dated session at/after today, and **states which one** in the confirmation. Clem can correct before confirming. |
| 2 | No confirmation / Clem goes silent | Nothing is pushed. The push only happens on explicit affirmative ("ok", "vas-y", "confirme"). No timeout auto-push. |
| 3 | Duplicate push (same session pushed twice) | Not deduped in v1. Garmin allows duplicate scheduled workouts; Coach warns in the confirmation if it already pushed this session today (tracked via a note in the weekly-plan file / `garmin-pushed.md` log). Clem decides. |
| 4 | Session has no explicit bpm range (only a zone name like "Z2") | Coach maps the zone to its bpm range from the athlete profile (Z2 = 107–128) using the **known zone table in CLAUDE.local.md**, and shows the concrete bpm range in the confirmation so Clem sees the real numbers. |
| 5 | Session is a rest day | Coach refuses: "C'est un jour de repos, rien à pousser." No workout created. |
| 6 | Session is non-cycling (run/swim/core) | Coach declines the Garmin push for v1 and says so plainly (cycling only). |
| 7 | Target date inference wrong | Coach infers the date from the session's weekday in the plan relative to today, and **shows the resolved calendar date** in the confirmation. Clem corrects if needed. |
| 8 | Garmin auth expired / MFA needed again | Script exits non-zero with a clear message; Coach relays "auth Garmin expirée, re-login nécessaire" rather than silently failing. Token refresh is automatic while the refresh token is valid. |
| 9 | **HR target stored as pace instead of HR** (the Garmin JSON footgun: `workoutTargetTypeId` is authoritative; wrong id/key silently stores as pace.zone) | Implementation MUST verify the exact custom-HR target-type id/key against the **installed** `garminconnect`/`garth` library, not guess. A test asserts the built step's target type resolves to heart-rate, not pace. |
| 10 | Script partially succeeds (uploaded but not scheduled) | Script is two-step (upload → schedule); on schedule failure it reports the created workout ID so it isn't orphaned silently, and Coach relays the partial state. |
| 11 | Malformed session JSON from Coach | Script validates the JSON (required: ordered steps, each with `type`, `durationSec`, `hrMin`, `hrMax`; sport=cycling) and exits with a specific error Coach can read and correct. |
| 12 | bpm range inverted / implausible (hrMin>hrMax, or 0/negative/>230) | Script rejects with a clear validation error. |
| 13 | Wrong Garmin account / credentials | Auth is from a pre-seeded on-disk token store (mounted read-only into the coach container); if it is missing/expired the script reports an auth error. The container never holds the password. Never prompt for raw creds in chat. |
| 14 | Timezone of the scheduled date | Garmin schedules by calendar date (no time). Coach resolves the date in Europe/Lisbon (Clem's tz) from the `<context now=.../>` value. |

## Entity model changes

None. No central-DB tables, columns, or migrations.

## Session DB contract

None. Standard message flow — no `inbound.db`/`outbound.db` schema changes, no
new fields, no `on_wake`.

## Library choice & risk (decided)

Use **`cyberjunky/python-garminconnect`** (PyPI `garminconnect`), **pinned to
`==0.3.6`**. Rationale: it is the de-facto standard client (2.6k★, MIT, actively
maintained — 0.3.6 released 2026-06-14, single-maintainer bus-factor noted). There
is **no official Garmin API** for workout creation; the library reverse-engineers
the private mobile-app SSO flow. That unofficial-API breakage risk is inherent to
*any* approach — writing it by hand would be strictly worse (same handshake, same
`workoutTargetTypeId`-stores-as-pace footgun, no community catching regressions).

Guardrails:
- **Pin the version.** Never `pip install` blindly; treat bumps as deliberate,
  matching the host supply-chain posture.
- **Isolate blast radius.** Auth material is a Garmin OAuth token store mounted
  only into the *coach* container. A misbehaving library sees the Garmin session
  and nothing else — no password, no other secrets, no other groups.
- **Uses Clem's real Garmin login against a private endpoint** (ToS grey area) —
  accepted knowingly by the operator.

## Container boundary

- **Python 3.12 requirement (base image).** `garminconnect>=0.3` requires
  Python ≥3.12, but the container base (`node:22-slim` / Debian bookworm) ships
  Python 3.11 in `/opt/wpenv`. So the per-group pip channel (which targets
  `/opt/wpenv`) cannot install it. Instead the **base image** builds a separate
  `/opt/py312` venv via `uv` (fetches a standalone CPython 3.12) with
  `garminconnect==0.3.6` + `pydantic` baked in (pinned via `UV_VERSION` /
  `GARMINCONNECT_VERSION` build args). The coach script runs under
  `/opt/py312/bin/python`. Requires a base-image rebuild (`./container/build.sh`).
- **pydantic is mandatory.** Without it, `garminconnect.workout` classes silently
  fall back to unconstructable stubs (`ExecutableStep() takes no arguments`). It
  is installed into `/opt/py312` alongside garminconnect.
- The generic **pip package channel** (migration 016, `packages_pip`) still
  exists as reusable infra but targets `/opt/wpenv` (3.11); it is *not* used for
  the Garmin deps. Coach's `packages_pip` is empty.
- **Credential (token-file mount):** a Garmin OAuth token store, seeded once by an
  interactive host login (`scripts/garmin_login.py`), lives at
  `groups/coach/.garminconnect/` (git-ignored, 0600) and reaches the container via
  the standard `groups/coach → /workspace/agent` mount at
  `/workspace/agent/.garminconnect`. No password in env, container, or chat.
- **Token persistence:** the store persists across container restarts (it lives on
  the host mount), so re-auth/MFA is one-time until the refresh token expires.
- No new host↔container protocol. No session-DB fields cross the boundary.

## API contract

No TypeScript changes. The contract is the **session JSON schema** (Coach writes
it, the Python script reads it) and the **script CLI**.

Session JSON (v1):

```json
{
  "sport": "cycling",
  "name": "Vélo Z2 — 65 min",
  "date": "2026-07-15",
  "description": "Piloter à la FC uniquement.",
  "steps": [
    { "type": "warmup",   "durationSec": 900,  "hrMin": 95,  "hrMax": 106, "note": "Z1" },
    { "type": "interval", "durationSec": 2100, "hrMin": 115, "hrMax": 128, "note": "Z2 cible 115-120" },
    { "type": "cooldown", "durationSec": 900,  "hrMin": 95,  "hrMax": 106, "note": "Z1" }
  ]
}
```

- `type` ∈ {`warmup`, `interval`, `recovery`, `cooldown`}. (`repeat` groups a
  later extension; v1 flattens repeats into explicit steps.)
- `durationSec` int > 0.
- `hrMin`/`hrMax` int bpm, `0 < hrMin < hrMax <= 230`.
- Target type is **custom heart-rate bpm range** per step (decision: not zone
  number), verified against the library so it is stored as HR, not pace.

Script CLI (Python, lives in the coach group workspace/scripts):

```
python push_to_garmin.py <session.json>
  # -> prints JSON: {"ok": true, "workoutId": <id>, "scheduledDate": "YYYY-MM-DD"}
  #    or {"ok": false, "error": "...", "workoutId": <id-if-uploaded>}
  # exit 0 on success, non-zero on any failure
```

Auth: loads the pre-seeded OAuth token store at `/workspace/agent/.garminconnect/`
(mounted from the host, never a password). Fails loud if missing/expired. An
optional `GARMIN_EMAIL`/`GARMIN_PASSWORD` env fallback exists for deployments that
inject them, but token-file mount is the default and only supported path here.

## Affected files

- `docs/features/coach-garmin-push.md` — this spec.
- `groups/coach/scripts/push_to_garmin.py` — the push script (build JSON→CyclingWorkout, upload, schedule).
- `groups/coach/scripts/test_push_to_garmin.py` — tests (validation, HR-target-type-is-HR-not-pace, JSON→step mapping) with the network call mocked.
- `groups/coach/scripts/garmin_login.py` — one-time interactive host login that seeds the OAuth token store.
- `container/Dockerfile` — `/opt/py312` venv (uv + CPython 3.12) with `garminconnect` + `pydantic` baked in.
- `.gitignore` — exclude `groups/*/.garminconnect/` and the host login venv.
- `groups/coach/CLAUDE.local.md` — add the `/garmin` (push-next-session) command spec + the on-demand-only + confirmation-required behavior + zone→bpm mapping instruction.
- `product-docs/` coach page — move "Automated Garmin push" from limitation to active (on-demand), document the command and the confirmation flow.

## Operator setup — Garmin credentials (one-time)

**Decision (implemented): token-file mount, option 2 below.** OneCLI's model
injects secrets as **HTTP headers** matching a host pattern, but `garminconnect`
logs in with **email + password** via Garmin's SSO flow and manages its own OAuth
token store — so header-injection does not fit. The chosen path: a one-time
interactive host login (`groups/coach/scripts/garmin_login.py`, run with
`.venv/garmin/bin/python`) writes the token store to `groups/coach/.garminconnect/`
(git-ignored, mode 0600), which mounts into the container at
`/workspace/agent/.garminconnect`. The container never holds the password. The
`_make_client()` in the push script authenticates token-first and fails loud if
the store is missing/expired. Re-seed by re-running the login helper when the
refresh token expires (~1 year). Options considered:

1. **Env-var injection (considered, not used).** The script reads `GARMIN_EMAIL` /
   `GARMIN_PASSWORD` from the environment. Store both in the OneCLI vault as
   `generic` secrets and configure OneCLI to expose them to the coach agent as
   env vars (or, if the deployment injects vault secrets into the container
   environment by agent, assign them to the coach agent). The token store then
   persists under `/workspace/agent/.garminconnect/` so MFA is one-time.

   ```bash
   onecli secrets create --name garmin-email    --type generic \
     --host-pattern connect.garmin.com --value '<email>'
   onecli secrets create --name garmin-password --type generic \
     --host-pattern connect.garmin.com --value '<password>'
   # then assign to the coach agent (identifier = agent group id):
   onecli agents list
   onecli agents set-secrets --id <coach-agent-id> --secret-ids <email-id>,<password-id>
   ```

   The **one-time MFA** login must be done interactively once so the token
   store is seeded — run the script (or `garminconnect` login) once with a
   TTY, complete MFA, and the refresh token persists thereafter.

2. **Pre-seeded token file (no password in vault).** Log in once on the host,
   produce `garmin_tokens.json`, and mount only that token file into the coach
   container at `/workspace/agent/.garminconnect/`. The container never sees the
   password. Refresh is automatic while the refresh token is valid; when it
   expires, re-seed. (Not wired by default — documented as the
   password-free alternative.)

Never place the raw credentials in `.env`, chat, or `CLAUDE.local.md`.

**Verify the delivery path before relying on it.** The script fails loud (exit 3,
`"garmin auth failed: GARMIN_EMAIL / GARMIN_PASSWORD not set"`) if the env vars
are absent — so a mis-wired credential path surfaces immediately rather than
silently. Confirm the coach container actually receives the env vars (run the
script once and check for the auth-failed message) before wiring the `/garmin`
flow into normal use.

**This step is left to the operator** — it requires the real Garmin login and a
one-time interactive MFA, which cannot be performed non-interactively.

## Success signal

Clem: "pousse la séance de demain sur Garmin"
→ Coach: shows structured session (warmup 15min FC 95–106, corps 35min FC 115–128,
   retour 15min FC 95–106), target date **mercredi 15 juillet**, asks to confirm.
Clem: "ok"
→ script runs, returns `{"ok": true, "workoutId": 123456789, "scheduledDate": "2026-07-15"}`
→ Coach: "✅ Séance poussée sur Garmin Connect, programmée pour le 15/07. Elle se
   synchronisera sur ton vélo au prochain sync."
→ Verifiable: the workout appears in Garmin Connect scheduled for 2026-07-15 with
   each step carrying its HR bpm range (confirmed as heart-rate target, not pace).
```
