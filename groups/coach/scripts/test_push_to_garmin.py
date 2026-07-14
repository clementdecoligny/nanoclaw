"""
test_push_to_garmin.py — TDD tests for the on-demand Garmin push.

These tests run WITHOUT the real `garminconnect` library installed. The host
never talks to Garmin — the real client only runs inside the coach container.
So we mock `garminconnect` in sys.modules and test OUR logic:
  - session JSON validation (schema, bpm sanity, sport, rest-day)
  - JSON step -> Garmin workout step mapping
  - the critical invariant: HR targets are stored as HEART RATE, not pace
    (Garmin's workoutTargetTypeId is authoritative; the wrong id silently
    stores a heart-rate range as pace.zone — issue #9 in the spec).
  - push() orchestration: upload then schedule, partial-failure reporting.

Run: .venv/finance/bin/pytest groups/coach/scripts/test_push_to_garmin.py -q
"""

import sys
import types
import pytest

# --- Mock the garminconnect library BEFORE importing the module under test. ---
# The module must NOT import garminconnect at import time in a way that requires
# the real package; a lazy import inside push() is fine. We install a stub so
# `import garminconnect` succeeds and exposes a Garmin class we can assert on.
_garmin_stub = types.ModuleType("garminconnect")


class _FakeGarmin:
    def __init__(self, *args, **kwargs):
        self.uploaded = None
        self.scheduled = None
        self._next_workout_id = 123456789
        self._fail_schedule = False

    def login(self, *args, **kwargs):
        return True

    def upload_cycling_workout(self, workout):
        self.uploaded = workout
        return {"workoutId": self._next_workout_id}

    def schedule_workout(self, workout_id, date):
        if self._fail_schedule:
            raise RuntimeError("schedule failed")
        self.scheduled = (workout_id, date)
        return {"ok": True}


_garmin_stub.Garmin = _FakeGarmin
sys.modules["garminconnect"] = _garmin_stub

import push_to_garmin as p  # noqa: E402


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
def valid_session():
    return {
        "sport": "cycling",
        "name": "Vélo Z2 — 65 min",
        "date": "2026-07-15",
        "description": "Piloter à la FC uniquement.",
        "steps": [
            {"type": "warmup", "durationSec": 900, "hrMin": 95, "hrMax": 106, "note": "Z1"},
            {"type": "interval", "durationSec": 2100, "hrMin": 115, "hrMax": 128, "note": "Z2"},
            {"type": "cooldown", "durationSec": 900, "hrMin": 95, "hrMax": 106, "note": "Z1"},
        ],
    }


# --------------------------------------------------------------------------- #
# Validation (spec edge cases #5, #6, #11, #12)
# --------------------------------------------------------------------------- #
def test_valid_session_passes_validation():
    p.validate_session(valid_session())  # should not raise


def test_rest_day_or_empty_steps_rejected():
    s = valid_session()
    s["steps"] = []
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_non_cycling_sport_rejected():
    s = valid_session()
    s["sport"] = "running"
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_missing_required_step_field_rejected():
    s = valid_session()
    del s["steps"][0]["hrMax"]
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_inverted_hr_range_rejected():
    s = valid_session()
    s["steps"][1]["hrMin"] = 140
    s["steps"][1]["hrMax"] = 120
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_implausible_bpm_rejected():
    s = valid_session()
    s["steps"][1]["hrMax"] = 250
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_zero_duration_rejected():
    s = valid_session()
    s["steps"][0]["durationSec"] = 0
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_unknown_step_type_rejected():
    s = valid_session()
    s["steps"][0]["type"] = "sprint"
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_malformed_but_shaped_date_rejected():
    """A date with the right shape but impossible values must be rejected."""
    s = valid_session()
    s["date"] = "2026-13-45"
    with pytest.raises(p.SessionError):
        p.validate_session(s)


def test_non_date_string_rejected():
    s = valid_session()
    s["date"] = "not-a-date"
    with pytest.raises(p.SessionError):
        p.validate_session(s)


# --------------------------------------------------------------------------- #
# Step mapping + the HR-not-pace invariant (spec edge case #9 — the footgun)
# --------------------------------------------------------------------------- #
def test_build_steps_preserves_order_and_count():
    steps = p.build_workout_steps(valid_session())
    assert len(steps) == 3


def test_every_step_target_is_heart_rate_not_pace():
    """The single most important test. Garmin stores the target by numeric
    workoutTargetTypeId; a wrong id silently turns an HR range into a pace
    range. Assert every built step's target resolves to heart rate."""
    steps = p.build_workout_steps(valid_session())
    for st in steps:
        ttype = st["targetType"]
        key = ttype["workoutTargetTypeKey"]
        tid = ttype["workoutTargetTypeId"]
        assert "heart.rate" in key, f"target key not HR: {key}"
        # id and key must be consistent (id is authoritative on Garmin's side)
        assert tid == p.HR_TARGET_TYPE_ID, (
            f"target id {tid} != canonical HR id {p.HR_TARGET_TYPE_ID}; "
            "mismatched id would be stored as pace"
        )


def test_bpm_range_carried_onto_step():
    steps = p.build_workout_steps(valid_session())
    interval = steps[1]
    assert interval["targetValueOne"] == 115
    assert interval["targetValueTwo"] == 128


def test_durations_carried_onto_step():
    steps = p.build_workout_steps(valid_session())
    assert steps[0]["endConditionValue"] == 900


# --------------------------------------------------------------------------- #
# push() orchestration (spec edge case #10 — partial success)
# --------------------------------------------------------------------------- #
def test_push_uploads_then_schedules_and_returns_id_and_date():
    client = _FakeGarmin()
    result = p.push(valid_session(), client)
    assert result["ok"] is True
    assert result["workoutId"] == 123456789
    assert result["scheduledDate"] == "2026-07-15"
    assert client.scheduled == (123456789, "2026-07-15")


def test_push_reports_partial_state_when_schedule_fails():
    client = _FakeGarmin()
    client._fail_schedule = True
    result = p.push(valid_session(), client)
    assert result["ok"] is False
    # workout was uploaded — must not be orphaned silently
    assert result["workoutId"] == 123456789
    assert "error" in result


def test_push_validates_before_touching_client():
    client = _FakeGarmin()
    bad = valid_session()
    bad["sport"] = "running"
    with pytest.raises(p.SessionError):
        p.push(bad, client)
    assert client.uploaded is None  # never touched Garmin on invalid input
