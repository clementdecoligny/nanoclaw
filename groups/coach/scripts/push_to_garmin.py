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
from datetime import datetime
from typing import Any

# Canonical Garmin HR target type — MUST match garminconnect
# workout.TargetType.HEART_RATE_ZONE. Used for a custom bpm range via
# targetValueOne/targetValueTwo (min/max bpm). id is authoritative on Garmin's
# side; a wrong id stores the range as pace. See module docstring + tests.
HR_TARGET_TYPE_ID = 4
HR_TARGET_TYPE_KEY = "heart.rate.zone"

ALLOWED_STEP_TYPES = {"warmup", "interval", "recovery", "cooldown"}
REQUIRED_STEP_FIELDS = ("type", "durationSec", "hrMin", "hrMax")
MAX_PLAUSIBLE_BPM = 230


class SessionError(ValueError):
    """Raised when the session JSON is malformed or physiologically implausible."""


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

    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            raise SessionError(f"step {i} is not an object")
        for field in REQUIRED_STEP_FIELDS:
            if field not in step:
                raise SessionError(f"step {i} missing required field {field!r}")

        stype = step["type"]
        if stype not in ALLOWED_STEP_TYPES:
            raise SessionError(
                f"step {i} has unknown type {stype!r}; "
                f"allowed: {sorted(ALLOWED_STEP_TYPES)}"
            )

        dur = step["durationSec"]
        if not isinstance(dur, (int, float)) or dur <= 0:
            raise SessionError(f"step {i} durationSec must be > 0, got {dur!r}")

        hr_min, hr_max = step["hrMin"], step["hrMax"]
        for label, v in (("hrMin", hr_min), ("hrMax", hr_max)):
            if not isinstance(v, (int, float)):
                raise SessionError(f"step {i} {label} must be a number, got {v!r}")
            if v <= 0 or v > MAX_PLAUSIBLE_BPM:
                raise SessionError(
                    f"step {i} {label}={v} out of plausible bpm range (1..{MAX_PLAUSIBLE_BPM})"
                )
        if hr_min >= hr_max:
            raise SessionError(
                f"step {i} inverted HR range: hrMin={hr_min} >= hrMax={hr_max}"
            )

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


def build_workout_steps(session: dict[str, Any]) -> list[dict[str, Any]]:
    """Map validated session steps to Garmin executable-step dicts, each with a
    custom HR bpm-range target. Order preserved; stepOrder is 1-based.

    Assumes `session` is already validated (callers validate at the entry
    point). Kept side-effect-free so it can be reused without re-validating."""
    out: list[dict[str, Any]] = []
    for idx, step in enumerate(session["steps"], start=1):
        type_id, type_key, disp = _STEP_TYPE_META[step["type"]]
        out.append(
            {
                "type": "ExecutableStepDTO",
                "stepOrder": idx,
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
        )
    return out


def build_cycling_workout(session: dict[str, Any]):
    """Build a garminconnect CyclingWorkout from a validated session.

    Imported lazily so the pure functions above are testable without the
    library installed (the host never has garminconnect; only the container
    does)."""
    from garminconnect.workout import (  # type: ignore
        CyclingWorkout,
        WorkoutSegment,
        ExecutableStep,
    )

    validate_session(session)
    raw_steps = build_workout_steps(session)
    steps = [ExecutableStep(**s) for s in raw_steps]
    total = int(sum(s["endConditionValue"] for s in raw_steps))
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
    """Authenticate to Garmin using env creds + on-disk token store."""
    from garminconnect import Garmin  # type: ignore

    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    tokenstore = os.environ.get("GARMIN_TOKENSTORE", "/workspace/agent/.garminconnect")

    if not email or not password:
        raise RuntimeError(
            "GARMIN_EMAIL / GARMIN_PASSWORD not set — credentials must be "
            "injected by OneCLI. Aborting rather than prompting."
        )

    client = Garmin(email, password)
    # login() loads the cached token if present and refreshes; otherwise does a
    # full SSO login (may require MFA — handled interactively at setup time).
    client.login(tokenstore)
    return client


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
