#!/usr/bin/env python3
"""
push_to_garmin.py — On-demand push of a single structured cycling session to
Garmin Connect, scheduled to a date, with per-step custom HR bpm ranges.

Coach writes a session JSON (see schema below), shows it to Clem for
confirmation, then runs:

    python push_to_garmin.py <session.json>

On success prints:  {"ok": true, "workoutId": <id>, "scheduledDate": "YYYY-MM-DD"}
On failure prints:  {"ok": false, "error": "...", "workoutId": <id-if-uploaded>}
Exit 0 on success, non-zero on any failure.

Session JSON schema (v1, cycling only):
{
  "sport": "cycling",
  "name": "Vélo Z2 — 65 min",
  "date": "2026-07-15",              # calendar date to schedule (Europe/Lisbon)
  "description": "Piloter à la FC uniquement.",
  "steps": [
    {"type": "warmup",   "durationSec": 900,  "hrMin": 95,  "hrMax": 106, "note": "Z1"},
    {"type": "interval", "durationSec": 2100, "hrMin": 115, "hrMax": 128, "note": "Z2"},
    {"type": "cooldown", "durationSec": 900,  "hrMin": 95,  "hrMax": 106, "note": "Z1"}
  ]
}

CRITICAL (spec issue #9): Garmin stores a step's target by numeric
workoutTargetTypeId. The HR target uses id 4 / key "heart.rate.zone". The
id is authoritative — id 6 would silently store the range as PACE. We hardcode
the canonical HR id/key (verified against garminconnect 0.3.6 source:
TargetType.HEART_RATE_ZONE = 4) and assert it in tests.

Credentials: Garmin email/password come from env (GARMIN_EMAIL / GARMIN_PASSWORD),
injected by OneCLI at request time — never from chat, never hardcoded. Token
store persists under GARMIN_TOKENSTORE (default /workspace/agent/.garminconnect)
so MFA is a one-time setup step.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime
from typing import Any

# requests uses REQUESTS_CA_BUNDLE, not SSL_CERT_FILE — bridge the gap so the
# OneCLI proxy CA (injected via SSL_CERT_FILE) is trusted by the garminconnect library.
if "REQUESTS_CA_BUNDLE" not in os.environ and os.environ.get("SSL_CERT_FILE"):
    os.environ["REQUESTS_CA_BUNDLE"] = os.environ["SSL_CERT_FILE"]

# Canonical Garmin HR target type — MUST match garminconnect
# workout.TargetType.HEART_RATE_ZONE. Used for a custom bpm range via
# targetValueOne/targetValueTwo (min/max bpm). id is authoritative on Garmin's
# side; a wrong id stores the range as pace. See module docstring + tests.
HR_TARGET_TYPE_ID = 4
HR_TARGET_TYPE_KEY = "heart.rate.zone"

ALLOWED_STEP_TYPES = {"warmup", "interval", "recovery", "cooldown"}
REQUIRED_STEP_FIELDS = ("type", "durationSec", "hrMin", "hrMax")
MAX_PLAUSIBLE_BPM = 230

# Garmin rejects a workout with more than 50 top-level steps as "not
# compatible" with the device (confirmed for Edge computers). A "repeat" step
# — N iterations of a small block — counts as ONE top-level step regardless
# of how many iterations it runs, so long unrolled sequences (e.g. a nutrition
# reminder every 20 min for 10h) must use it instead of flat repetition.
MAX_TOP_LEVEL_STEPS = 50


class SessionError(ValueError):
    """Raised when the session JSON is malformed or physiologically implausible."""


def _validate_step(step: dict[str, Any], label: str, *, allow_repeat: bool) -> None:
    """Validate one step. A 'repeat' step (only one level deep) wraps a small
    block of leaf steps run for N iterations — nested repeats are not supported."""
    if not isinstance(step, dict):
        raise SessionError(f"{label} is not an object")

    if step.get("type") == "repeat":
        if not allow_repeat:
            raise SessionError(f"{label}: nested 'repeat' steps are not supported")
        iterations = step.get("iterations")
        if not isinstance(iterations, int) or iterations <= 0:
            raise SessionError(f"{label} iterations must be a positive int, got {iterations!r}")
        inner = step.get("steps")
        if not isinstance(inner, list) or len(inner) == 0:
            raise SessionError(f"{label} 'repeat' needs a non-empty 'steps' list")
        for j, child in enumerate(inner):
            _validate_step(child, f"{label}.steps[{j}]", allow_repeat=False)
        return

    for field in REQUIRED_STEP_FIELDS:
        if field not in step:
            raise SessionError(f"{label} missing required field {field!r}")

    stype = step["type"]
    if stype not in ALLOWED_STEP_TYPES:
        raise SessionError(
            f"{label} has unknown type {stype!r}; "
            f"allowed: {sorted(ALLOWED_STEP_TYPES)} (or 'repeat')"
        )

    dur = step["durationSec"]
    if not isinstance(dur, (int, float)) or dur <= 0:
        raise SessionError(f"{label} durationSec must be > 0, got {dur!r}")

    hr_min, hr_max = step["hrMin"], step["hrMax"]
    for hlabel, v in (("hrMin", hr_min), ("hrMax", hr_max)):
        if not isinstance(v, (int, float)):
            raise SessionError(f"{label} {hlabel} must be a number, got {v!r}")
        if v <= 0 or v > MAX_PLAUSIBLE_BPM:
            raise SessionError(
                f"{label} {hlabel}={v} out of plausible bpm range (1..{MAX_PLAUSIBLE_BPM})"
            )
    if hr_min >= hr_max:
        raise SessionError(f"{label} inverted HR range: hrMin={hr_min} >= hrMax={hr_max}")


# --------------------------------------------------------------------------- #
# Validation (spec edge cases #5, #6, #11, #12)
# --------------------------------------------------------------------------- #
def validate_session(session: dict[str, Any]) -> None:
    """Validate a session dict. Raises SessionError on any problem."""
    if not isinstance(session, dict):
        raise SessionError("session must be a JSON object")

    sport = session.get("sport")
    if sport != "cycling":
        raise SessionError(
            f"unsupported sport {sport!r}; only 'cycling' is supported in v1"
        )

    steps = session.get("steps")
    if not isinstance(steps, list) or len(steps) == 0:
        # empty steps == rest day or nothing to push
        raise SessionError("no steps to push (rest day or empty session)")

    if len(steps) > MAX_TOP_LEVEL_STEPS:
        raise SessionError(
            f"session has {len(steps)} top-level steps; Garmin devices reject "
            f"workouts over {MAX_TOP_LEVEL_STEPS}. Wrap repetition in a "
            f"'repeat' step (iterations + steps) instead of unrolling it"
        )

    for i, step in enumerate(steps):
        _validate_step(step, f"step {i}", allow_repeat=True)

    date = session.get("date")
    if not isinstance(date, str):
        raise SessionError(f"date must be a 'YYYY-MM-DD' string, got {date!r}")
    try:
        # strptime rejects impossible dates (e.g. 2026-13-45) that a shape check misses.
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise SessionError(f"date must be a real 'YYYY-MM-DD' date, got {date!r}") from None


# --------------------------------------------------------------------------- #
# JSON -> Garmin workout step mapping (spec edge case #9)
# --------------------------------------------------------------------------- #
_STEP_TYPE_META = {
    "warmup": (1, "warmup", 1),
    "interval": (3, "interval", 3),
    "recovery": (4, "recovery", 4),
    "cooldown": (2, "cooldown", 2),
}
_CONDITION_TIME = {
    "conditionTypeId": 2,
    "conditionTypeKey": "time",
    "displayOrder": 2,
    "displayable": True,
}


def _hr_target() -> dict[str, Any]:
    """Custom-HR target-type stub. The bpm values live on the step itself
    (targetValueOne/Two); this only pins the target TYPE to heart rate."""
    return {
        "workoutTargetTypeId": HR_TARGET_TYPE_ID,
        "workoutTargetTypeKey": HR_TARGET_TYPE_KEY,
        "displayOrder": 1,
    }


_CONDITION_ITERATIONS = {
    "conditionTypeId": 7,
    "conditionTypeKey": "iterations",
    "displayOrder": 7,
    "displayable": False,
}


def _build_leaf_step(step: dict[str, Any], order: int) -> dict[str, Any]:
    type_id, type_key, disp = _STEP_TYPE_META[step["type"]]
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": {
            "stepTypeId": type_id,
            "stepTypeKey": type_key,
            "displayOrder": disp,
        },
        "endCondition": dict(_CONDITION_TIME),
        "endConditionValue": float(step["durationSec"]),
        "targetType": _hr_target(),
        # bpm min/max — extra fields on the step (ExecutableStep allows extra)
        "targetValueOne": float(step["hrMin"]),
        "targetValueTwo": float(step["hrMax"]),
        "description": step.get("note"),
    }


def build_workout_steps(session: dict[str, Any]) -> list[dict[str, Any]]:
    """Map validated session steps to Garmin step dicts (leaf steps and/or
    repeat groups), each leaf carrying a custom HR bpm-range target. Order
    preserved; stepOrder is 1-based and shared across the whole tree.

    Assumes `session` is already validated (callers validate at the entry
    point). Kept side-effect-free so it can be reused without re-validating."""
    out: list[dict[str, Any]] = []
    order = 0

    def build(step: dict[str, Any]) -> dict[str, Any]:
        nonlocal order
        order += 1
        this_order = order
        if step["type"] == "repeat":
            children = [build(child) for child in step["steps"]]
            return {
                "type": "RepeatGroupDTO",
                "stepOrder": this_order,
                "stepType": {
                    "stepTypeId": 6,
                    "stepTypeKey": "repeat",
                    "displayOrder": 6,
                },
                "numberOfIterations": step["iterations"],
                "workoutSteps": children,
                "endCondition": dict(_CONDITION_ITERATIONS),
                "endConditionValue": float(step["iterations"]),
            }
        return _build_leaf_step(step, this_order)

    for step in session["steps"]:
        out.append(build(step))
    return out


def _total_duration_secs(steps: list[dict[str, Any]]) -> int:
    """Recursively sum session-shaped (not yet built) steps' durations,
    multiplying repeat blocks by their iteration count."""
    total = 0
    for step in steps:
        if step["type"] == "repeat":
            total += step["iterations"] * _total_duration_secs(step["steps"])
        else:
            total += step["durationSec"]
    return total


def build_cycling_workout(session: dict[str, Any]):
    """Build a garminconnect CyclingWorkout from a validated session.

    Imported lazily so the pure functions above are testable without the
    library installed (the host never has garminconnect; only the container
    does)."""
    from garminconnect.workout import (  # type: ignore
        CyclingWorkout,
        WorkoutSegment,
        ExecutableStep,
        RepeatGroup,
    )

    validate_session(session)
    raw_steps = build_workout_steps(session)

    def to_model(s: dict[str, Any]):
        return RepeatGroup(**s) if s["type"] == "RepeatGroupDTO" else ExecutableStep(**s)

    steps = [to_model(s) for s in raw_steps]
    total = _total_duration_secs(session["steps"])
    return CyclingWorkout(
        workoutName=session.get("name", "Séance vélo"),
        estimatedDurationInSecs=total,
        description=session.get("description"),
        workoutSegments=[
            WorkoutSegment(
                segmentOrder=1,
                sportType={"sportTypeId": 2, "sportTypeKey": "cycling", "displayOrder": 2},
                workoutSteps=steps,
            )
        ],
    )


# --------------------------------------------------------------------------- #
# Orchestration: validate -> upload -> schedule (spec edge case #10)
# --------------------------------------------------------------------------- #
def push(session: dict[str, Any], client: Any) -> dict[str, Any]:
    """Upload the session as a cycling workout and schedule it to session['date'].

    `client` is a garminconnect.Garmin instance (or a compatible stub in tests).
    Validation happens FIRST — an invalid session never touches Garmin.
    Returns a result dict; on partial success (uploaded but not scheduled) the
    workoutId is reported so the workout is not orphaned silently.
    """
    validate_session(session)
    date = session["date"]

    # In tests the stub's upload_cycling_workout accepts our built object; in
    # production the real client requires a CyclingWorkout instance. We hand it
    # a CyclingWorkout when the library is present, else the raw dict payload.
    # (session already validated above; the builders trust that.)
    try:
        workout: Any = build_cycling_workout(session)
    except ImportError:
        # library not available (should not happen in container) — pass dict
        workout = {"steps": build_workout_steps(session)}

    up = client.upload_cycling_workout(workout)
    workout_id = up.get("workoutId") if isinstance(up, dict) else None
    if workout_id is None:
        return {"ok": False, "error": "upload returned no workoutId", "raw": up}

    try:
        client.schedule_workout(workout_id, date)
    except Exception as e:  # partial success — do not orphan silently
        return {
            "ok": False,
            "error": f"uploaded but scheduling failed: {e}",
            "workoutId": workout_id,
        }

    return {"ok": True, "workoutId": workout_id, "scheduledDate": date}


# --------------------------------------------------------------------------- #
# Auth + CLI entrypoint
# --------------------------------------------------------------------------- #
def _make_client() -> Any:
    """Authenticate to Garmin from the on-disk token store.

    The container never holds the Garmin password. A one-time interactive
    login on the host (see scripts/garmin_login.py) seeds the token store at
    GARMIN_TOKENSTORE; here we load it and let the library auto-refresh. If
    the store is missing or the refresh token has expired, we fail loud so
    the operator re-seeds rather than silently hanging.

    Optional env fallback: if GARMIN_EMAIL / GARMIN_PASSWORD *are* present
    (e.g. a deployment that injects them), a full login is attempted. This is
    not the default path — token-file mount is.
    """
    from garminconnect import Garmin  # type: ignore

    tokenstore = os.environ.get("GARMIN_TOKENSTORE", "/workspace/agent/.garminconnect")
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")

    if not os.path.isdir(tokenstore) and not (email and password):
        raise RuntimeError(
            f"no Garmin token store at {tokenstore} and no GARMIN_EMAIL/PASSWORD. "
            "Seed the token store once on the host (scripts/garmin_login.py)."
        )

    # Garmin(...) accepts empty creds; login(tokenstore) then loads and
    # refreshes the cached OAuth tokens. Only if the store is absent does it
    # need the email/password to do a full SSO login.
    client = Garmin(email or "", password or "")
    # Retry once before blaming the refresh token. login() refreshes an expired
    # ACCESS token on its own, and the first attempt can still fail on a
    # transient network/5xx from Garmin. Treating that as "refresh token dead"
    # sends the operator to a needless interactive MFA re-login — and the agent
    # relays that advice to the user, who then can't push a session that would
    # have gone through on a second try.
    last_err: Exception | None = None
    for attempt in (1, 2):
        try:
            client.login(tokenstore)
            return client
        except Exception as e:  # noqa: PERF203 — two attempts, clarity over speed
            last_err = e
            if attempt == 1:
                time.sleep(2)

    raise RuntimeError(
        f"Garmin auth from token store failed after 2 attempts ({last_err}). "
        "The access token refreshes automatically, so this usually means the "
        "REFRESH token itself expired (~1 year) or Garmin is down. Verify with "
        "a third attempt before re-seeding; if it keeps failing, re-run "
        "scripts/garmin_login.py on the host (needs an interactive TTY for MFA)."
    ) from last_err


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: push_to_garmin.py <session.json>"}))
        return 2

    try:
        with open(argv[1], encoding="utf-8") as f:
            session = json.load(f)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"cannot read session json: {e}"}))
        return 2

    try:
        validate_session(session)
    except SessionError as e:
        print(json.dumps({"ok": False, "error": f"invalid session: {e}"}))
        return 2

    try:
        client = _make_client()
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"garmin auth failed: {e}"}))
        return 3

    result = push(session, client)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 4


if __name__ == "__main__":
    sys.exit(main(sys.argv))
