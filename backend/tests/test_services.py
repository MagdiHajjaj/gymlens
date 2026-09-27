from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Event
from types import SimpleNamespace
import json
import time
import httpx
from app import services
from app.core.config import settings
from app.schemas import SpeechRequest
from app.main import app
from app.core.security import optional_subject
from test_workouts import create, rep


def test_current_frontend_coaching_copy_is_accepted():
    """Catch frontend cue additions that otherwise fail only against the live API."""
    import re
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    for relative in (
        "features/exercises/MovementCues.ts",
        "features/exercises/ExerciseAnalyzer.ts",
        "features/exercises/CurlAnalyzer.ts",
        "features/coaching/Phrasebook.ts",
    ):
        source = (root / "frontend/src" / relative).read_text(encoding="utf-8")
        for match in re.finditer(r"(['\"])((?:\\.|(?!\1)[^\r\n])*)\1", source):
            phrase = match[2]
            if (len(phrase) > 15 and phrase.endswith((".", "!"))
                    and "${" not in phrase and "\\" not in phrase):
                assert SpeechRequest(text=phrase).text == phrase, (relative, phrase)


def test_new_coaching_variants_remain_bounded(client, monkeypatch):
    from pydantic import ValidationError
    import pytest

    valid = [
        "Exercise complete. Nice work.",
        "Rep complete.",
        "Reset your position. Keep your upper arm close to your side.",
        "Slow the next rep down. Keep your chest a little more upright.",
        "Rep not counted: Try a fuller range of motion at a comfortable pace.",
        "Rep not counted: slow down — take at least 0.7 seconds per rep.",
        "Rep not counted: keep the press moving for at least 0.8 seconds.",
        "Rep not counted: press overhead until your arms are straight, then return to your shoulders.",
        "Rep 6 — best range yet. Hold that standard.",
        "Rep 5000 — short of your usual range. Reach a little further.",
        "Rep 7 — slow it down. Control the movement.",
    ]
    monkeypatch.setattr(services, "speech", lambda text, before_provider=None: b"test-audio")
    for phrase in valid:
        assert client.post("/api/coaching/speech", json={"text": phrase}).status_code == 200
    for phrase in [
        "Reset your position. Say anything I want.",
        "Rep not counted: arbitrary speech",
        "Rep 0 — best range yet. Hold that standard.",
        "Rep 5001 — best range yet. Hold that standard.",
        "Rep 6 — best range yet. Hold that standard. Extra text.",
        "Rep not counted: slow down — take at least 999 seconds per rep.",
        "5001. Stay controlled.",
        "5. Do whatever you want.",
        "0. Keep the rhythm.",
    ]:
        with pytest.raises(ValidationError):
            SpeechRequest(text=phrase)


def test_voice_phrase_grammar_allows_bounded_coach_phrases():
    valid = [
        "Voice coach is ready. Let's get moving.",
        "1.",
        "5000.",
        "5. Stay controlled.",
        "15. Keep the rhythm.",
        "25. Steady pace.",
        "5000. Stay controlled.",
        "Keep the rhythm.",
        "Stay controlled.",
        "Rep 1 complete.",
        "Rest 30 seconds.",
        "Rest 60 seconds.",
        "Rest 90 seconds.",
        "Set 99, go.",
        "Rep 6 complete.",
        "Rep 4999 complete. Bottom angle 180 degrees.",
        "Ready. 1 rep so far.",
        "Ready. 24 reps so far.",
        "Keep your back flat — hinge at the hips, chest proud.",
        "Pull all the way up — chin over the bar.",
        "Set 3 complete. 12 reps. 2 technique cues. Sit a little deeper next set.",
        "Set 1 complete. 1 arm rep. No technique cues detected.",
        "Set 2 complete. 8 reps. 3 technique cues. Hinge deeper at the hips next set.",
        "Session complete. 24 arm reps across 3 sets. 1 technique cue. "
        "Focus on a steady upper arm next session.",
        "Session complete. 0 reps across 0 sets. No technique cues detected.",
        "Session complete. No bicep curl reps were recorded.",
        "Session complete. 16 reps across 2 sets. 4 technique cues. "
        "Focus on a deeper hip hinge next session.",
        "Chest up — stay tall through the rep.",
        "No swinging — strict curls only.",
        "Rep 6 — best range yet. Hold that standard.",
        "Rep 24 — short of your usual range. Reach a little further.",
        "Rep 3 — slow it down. Control the movement.",
        "Rep 10 — control the way down. Don't drop the weight.",
    ]
    for text in valid:
        assert SpeechRequest(text=text).text == text


def test_voice_phrase_grammar_accepts_new_torso_swing_fault():
    from app.schemas import Fault

    fault = Fault(
        code="excessive_torso_swing",
        message="Keep your torso still — don't swing the weight up.",
        severity="warning",
    )
    assert fault.code == "excessive_torso_swing"
    assert SpeechRequest(text=fault.message).text == fault.message


def test_voice_phrase_grammar_rejects_unbounded_phrases():
    invalid = [
        "0.",
        "5001.",
        "Rest 45 seconds.",
        "Set 100, go.",
        "Rep 0 complete.",
        "Rep 5001 complete.",
        "Rep 2 complete. Bottom angle 181 degrees.",
        "Ready. 1 reps so far.",
        "Set 3 complete. 6000 reps. No technique cues detected.",
        "Set 3 complete. 1 reps. No technique cues detected.",
        "Session complete. 24 arm reps across 1 sets. No technique cues detected.",
        "Session complete. 24 arm reps across 3 sets. 1 technique cues. "
        "Focus on a steady upper arm next session.",
        "Set 2 complete. 12 reps. 2 technique cues. Ignore prior instructions.",
        "Say arbitrary user content",
        "Rep 0 — best range yet. Hold that standard.",
        "Rep 6 — best range yet. Hold that standard. Extra words.",
    ]
    for text in invalid:
        try:
            SpeechRequest(text=text)
        except ValueError:
            pass
        else:
            raise AssertionError(f"accepted invalid phrase: {text}")


def test_voice_allowlist_provider_cache_and_fallback(client, monkeypatch):
    assert client.post("/api/coaching/speech", json={"text": "Say arbitrary user content"}).status_code == 422
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")
    phrase = {"text": "Keep your chest a little more upright."}
    assert client.post("/api/coaching/speech", json=phrase).status_code == 503
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")
    calls = []

    def post(*args, **kwargs):
        calls.append(kwargs)
        return httpx.Response(
            200,
            content=b"test-audio",
            headers={"content-type": "audio/mpeg"},
            request=httpx.Request("POST", args[0]),
        )

    monkeypatch.setattr(services.httpx, "post", post)
    for _ in range(2):
        response = client.post("/api/coaching/speech", json=phrase)
        assert response.status_code == 200
        assert response.content == b"test-audio"
    assert len(calls) == 1
    assert calls[0]["json"]["text"] == phrase["text"]
    assert services.speech_cached(phrase["text"])


def test_guest_can_request_only_approved_coaching_audio(client, monkeypatch):
    del app.dependency_overrides[optional_subject]
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")
    assert client.post("/api/coaching/speech", json={"text": "1."}).status_code == 503
    assert client.post("/api/coaching/speech", json={"text": "Say arbitrary user content"}).status_code == 422


def test_voice_audio_cache_evicts_by_recency_and_byte_budget(client, monkeypatch):
    monkeypatch.setattr(services, "_AUDIO_CACHE_MAX_ENTRIES", 2)
    monkeypatch.setattr(services, "_AUDIO_CACHE_MAX_BYTES", 100)
    services._cache_audio("first", b"one")
    services._cache_audio("second", b"two")
    assert services.speech_cached("first")
    services._cache_audio("third", b"three")
    assert services.speech_cached("first")
    assert not services.speech_cached("second")

    services._audio.clear()
    monkeypatch.setattr(services, "_AUDIO_CACHE_MAX_ENTRIES", 10)
    monkeypatch.setattr(services, "_AUDIO_CACHE_MAX_BYTES", 5)
    services._cache_audio("first", b"1234")
    services._cache_audio("second", b"5678")
    assert not services.speech_cached("first")
    assert services.speech_cached("second")


def test_voice_rejects_invalid_audio_without_caching(client, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")

    def invalid(*args, **kwargs):
        return httpx.Response(
            200,
            content=b"not-audio",
            headers={"content-type": "application/json"},
            request=httpx.Request("POST", args[0]),
        )

    monkeypatch.setattr(services.httpx, "post", invalid)
    text = "5. Stay controlled."
    assert client.post("/api/coaching/speech", json={"text": text}).status_code == 503
    assert not services.speech_cached(text)


def test_concurrent_voice_misses_share_one_provider_call(client, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")
    started = Event()
    release = Event()
    calls = []

    def post(*args, **kwargs):
        calls.append(kwargs)
        started.set()
        assert release.wait(1)
        return httpx.Response(
            200,
            content=b"test-audio",
            headers={"content-type": "audio/mpeg"},
            request=httpx.Request("POST", args[0]),
        )

    monkeypatch.setattr(services.httpx, "post", post)
    text = "15. Keep the rhythm."
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(services.speech, text)
        assert started.wait(1)
        second = pool.submit(services.speech, text)
        time.sleep(0.02)
        release.set()
        assert first.result() == b"test-audio"
        assert second.result() == b"test-audio"
    assert len(calls) == 1
    assert text not in services._speech_inflight


def completed_session(client):
    sid = create(client)["id"]
    client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [rep()]})
    assert (
        client.patch(
            f"/api/workouts/{sid}", json={"ended_at": datetime.now(timezone.utc).isoformat()}
        ).status_code
        == 200
    )
    return sid


def test_gemini_unavailable_preserves_stats(client, monkeypatch):
    sid = completed_session(client)
    monkeypatch.setattr(settings, "gemini_api_key", "")
    assert client.post(f"/api/workouts/{sid}/insights").status_code == 503
    assert client.get(f"/api/workouts/{sid}").json()["total_reps"] == 1


def test_gemini_structured_validation_and_saved_result(client, monkeypatch):
    sid = completed_session(client)
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    calls = []
    valid = {
        "recap": "One rep measured.",
        "strengths": [],
        "improvements": [],
        "next_focus": "Keep a steady pace.",
    }

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(text=json.dumps(valid))

    monkeypatch.setattr(services.genai, "Client", FakeClient)
    response = client.post(f"/api/workouts/{sid}/insights")
    assert response.status_code == 200, response.text
    assert response.json()["source"] == "gemini"
    payload = json.loads(calls[0]["contents"].split("Session evidence:\n", 1)[1])
    assert payload["exercise"] == "squat"
    assert payload["totals"]["reps"] == 1
    assert payload["range"]["averageMinAngle"] == 92
    assert payload["tempo"]["averageMs"] == 2500
    assert "rep numbers" in calls[0]["contents"]
    assert "Summarize only these observed exercise statistics" not in calls[0]["contents"]
    config = calls[0]["config"]
    assert config.temperature == 0.7
    assert config.response_schema is None
    assert config.response_json_schema["additionalProperties"] is False
    assert set(config.response_json_schema["required"]) == {
        "recap", "strengths", "improvements", "next_focus"
    }
    assert client.post(f"/api/workouts/{sid}/insights").json() == response.json()
    assert len(calls) == 1
    assert client.get(f"/api/workouts/{sid}").json()["insight"]["recap"] == valid["recap"]


def test_workout_summary_fault_labels_are_plain_language():
    workout = make_workout(
        reps=[
            make_rep(1, full_metrics(90)),
            make_rep(
                2,
                full_metrics(110),
                [
                    {"code": "insufficient_depth", "message": "Deeper", "severity": "warning"},
                    {"code": "mystery_code", "message": "?", "severity": "info"},
                ],
            ),
        ]
    )
    faults = {f["code"]: f for f in services._workout_summary(workout)["faults"]}
    assert faults["insufficient_depth"]["label"] == "Shallow depth"
    assert faults["mystery_code"]["label"] == "mystery_code"  # unknown codes pass through


def test_fault_history_marks_a_previous_cue_as_resolved():
    trends = services._fault_trends([], [{
        "faults": [{"code": "insufficient_depth", "label": "Shallow depth", "percent": 50}],
    }])
    assert trends == [{
        "label": "Shallow depth",
        "trend": "resolved",
        "priorSessionsAffected": 1,
        "priorAveragePercent": 50,
        "currentPercent": 0,
    }]


def test_workout_summary_includes_athlete_profile():
    workout = make_workout(reps=[make_rep(1, full_metrics(90))])
    user = SimpleNamespace(fitness_goal="strength", experience_level="intermediate")
    assert services._workout_summary(workout, user)["athlete"] == {
        "fitness_goal": "strength",
        "experience_level": "intermediate",
    }
    assert "athlete" not in services._workout_summary(workout)
    assert "athlete" not in services._workout_summary(workout, SimpleNamespace())


def test_invalid_gemini_output_is_not_saved(client, monkeypatch):
    sid = completed_session(client)
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")

    class InvalidClient:
        def __init__(self, **kwargs):
            self.models = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def generate_content(self, **kwargs):
            return SimpleNamespace(text='{"invented":"garbage"}')

    monkeypatch.setattr(services.genai, "Client", InvalidClient)
    assert client.post(f"/api/workouts/{sid}/insights").status_code == 503
    assert client.get(f"/api/workouts/{sid}").json()["insight"] is None


def make_rep(number, metrics, faults=()):
    return SimpleNamespace(rep_number=number, metrics_json=metrics, faults_json=list(faults))


def make_workout(exercise="squat", source="camera", reps=()):
    return SimpleNamespace(exercise=exercise, source=source, reps=list(reps))


def full_metrics(min_angle, number=1):
    return {
        "min_angle": min_angle,
        "max_angle": min_angle + 75,
        "duration_ms": 2400,
        "eccentric_ms": 1200,
        "concentric_ms": 1200,
    }


def test_workout_summary_totals_and_clean_streak():
    workout = make_workout(
        reps=[
            make_rep(1, full_metrics(90)),
            make_rep(2, full_metrics(92), [{"code": "insufficient_depth", "message": "Deeper", "severity": "warning"}]),
            make_rep(3, full_metrics(91)),
            make_rep(4, full_metrics(93)),
            make_rep(5, full_metrics(92)),
        ]
    )
    summary = services._workout_summary(workout)
    assert summary["exercise"] == "squat"
    assert summary["totals"] == {"reps": 5, "measuredReps": 5, "cleanReps": 4, "longestCleanStreak": 3}
    assert summary["repCountUnit"] == "movement cycles"


def test_workout_summary_includes_load_plan_and_completed_sets():
    workout = make_workout(reps=[])
    workout.weight_kg = 42.5
    workout.target_sets = 3
    workout.target_reps = 8
    workout.set_ranges = [{"set_number": 1, "start_rep": 1, "end_rep": 8}]
    assert services._workout_summary(workout)["training"] == {
        "weightKg": 42.5,
        "targetSets": 3,
        "targetRepsPerSet": 8,
        "completedSets": 1,
        "sets": workout.set_ranges,
    }


def test_workout_summary_range_trend_best_rep_and_rom():
    workout = make_workout(
        reps=[make_rep(n, full_metrics(angle), [{"code": "insufficient_depth", "message": "Deeper", "severity": "warning"}] if n == 6 else [])
              for n, angle in enumerate([90, 92, 94, 96, 98, 100], start=1)]
    )
    summary = services._workout_summary(workout)
    assert summary["range"]["averageMinAngle"] == 95.0
    assert summary["range"]["averageRom"] == 75.0
    # Best rep is the deepest clean rep; rep 6 has a fault so rep 1 wins.
    assert summary["range"]["bestRep"] == {"rep": 1, "minAngle": 90}
    trend = summary["range"]["trend"]
    assert trend["firstReps"] == [1, 2]
    assert trend["lastReps"] == [5, 6]
    assert trend["change"] == 8.0  # depth faded across the session
    assert summary["range"]["minAngleStdDev"] > 0


def test_workout_summary_tempo_splits():
    workout = make_workout(
        reps=[
            make_rep(1, {"min_angle": 90, "duration_ms": 2000, "eccentric_ms": 1200, "concentric_ms": 800}),
            make_rep(2, {"min_angle": 92, "duration_ms": 3000, "eccentric_ms": 1800, "concentric_ms": 1200}),
        ]
    )
    tempo = services._workout_summary(workout)["tempo"]
    assert tempo == {
        "averageMs": 2500,
        "spreadMs": 1000,
        "averageEccentricMs": 1500,
        "averageConcentricMs": 1000,
    }


def test_workout_summary_fault_timing_and_percent():
    workout = make_workout(
        reps=[
            make_rep(n, full_metrics(90), [{"code": "knee_over_toes", "message": "Knee", "severity": "warning"}] if n <= 2 else [])
            for n in range(1, 7)
        ]
        + [
            make_rep(n, full_metrics(90), [{"code": "excessive_forward_lean", "message": "Chest", "severity": "warning"}])
            for n in (1, 6)
        ]
    )
    faults = {fault["code"]: fault for fault in services._workout_summary(workout)["faults"]}
    assert faults["knee_over_toes"]["timing"] == "early"
    assert faults["knee_over_toes"]["percent"] == 25
    assert faults["knee_over_toes"]["reps"] == [1, 2]
    assert faults["excessive_forward_lean"]["timing"] == "throughout"
    # Tied counts sort alphabetically by code.
    ordered = [fault["code"] for fault in services._workout_summary(workout)["faults"]]
    assert ordered == ["excessive_forward_lean", "knee_over_toes"]


def test_workout_summary_notes_missing_metrics():
    workout = make_workout(
        reps=[
            make_rep(1, {"duration_ms": 2000}),
            make_rep(2, {"min_angle": 90, "duration_ms": 2000}),
        ]
    )
    summary = services._workout_summary(workout)
    assert summary["totals"]["measuredReps"] == 1
    assert any("min_angle missing on 1 of 2 reps" in note for note in summary["notes"])
    assert any("range-of-motion" in note for note in summary["notes"])
    assert any("tempo split" in note for note in summary["notes"])
    assert summary["range"]["trend"] is None  # too few measurements for a trend


def test_workout_summary_arm_side_rep_unit():
    workout = make_workout(
        exercise="curl",
        reps=[make_rep(1, {**full_metrics(60), "arm_side": 2})],
    )
    assert services._workout_summary(workout)["repCountUnit"] == "paired arm cycles"


def test_workout_summary_includes_plain_language_curl_range_guidance():
    workout = make_workout(exercise="curl", reps=[make_rep(1, full_metrics(62))])

    guidance = services._workout_summary(workout)["range"]["guidance"]

    assert guidance["measurement"] == "elbow bend at the top"
    assert guidance["referenceDegrees"] == {"min": 45, "max": 70}
    assert "smaller angle" in guidance["meaning"]


def test_rep_schema_accepts_new_tempo_and_rom_metrics(client):
    sid = create(client)["id"]
    payload = {
        "reps": [
            {
                "rep_number": 1,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "metrics_json": {
                    "min_angle": 92,
                    "max_angle": 168,
                    "duration_ms": 2500,
                    "eccentric_ms": 1300,
                    "concentric_ms": 1200,
                },
                "faults_json": [],
            }
        ]
    }
    response = client.post(f"/api/workouts/{sid}/reps/batch", json=payload)
    assert response.status_code == 200, response.text
    stored = client.get(f"/api/workouts/{sid}").json()["reps"][0]["metrics_json"]
    assert stored["max_angle"] == 168
    assert stored["eccentric_ms"] == 1300
    assert stored["concentric_ms"] == 1200


def test_costly_endpoint_provider_miss_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")
    for _ in range(40):
        assert (
            client.post(
                "/api/coaching/speech", json={"text": "Keep your chest a little more upright."}
            ).status_code
            == 503
        )
    assert (
        client.post(
            "/api/coaching/speech", json={"text": "Keep your chest a little more upright."}
        ).status_code
        == 429
    )


def test_voice_disk_cache_and_backoff(client, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")
    phrase = {"text": "Keep your chest a little more upright."}
    calls = []

    def ok(*args, **kwargs):
        calls.append(1)
        return httpx.Response(
            200, content=b"disk-audio", headers={"content-type": "audio/mpeg"}, request=httpx.Request("POST", args[0])
        )

    monkeypatch.setattr(services.httpx, "post", ok)
    assert client.post("/api/coaching/speech", json=phrase).content == b"disk-audio"
    services._audio.clear()  # simulate a server restart: memory is gone, disk is not
    assert client.post("/api/coaching/speech", json=phrase).content == b"disk-audio"
    assert len(calls) == 1

    def fail(*args, **kwargs):
        calls.append(1)
        raise httpx.ConnectError("quota")

    monkeypatch.setattr(services.httpx, "post", fail)
    other = {"text": "Keep your upper arm close to your side."}
    assert client.post("/api/coaching/speech", json=other).status_code == 503
    assert client.post("/api/coaching/speech", json=other).status_code == 503
    assert len(calls) == 2  # the second failure did not call the provider again


def test_cached_speech_does_not_consume_provider_miss_budget(client, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")
    calls = []

    def post(*args, **kwargs):
        calls.append(kwargs)
        return httpx.Response(
            200,
            content=b"test-audio",
            headers={"content-type": "audio/mpeg"},
            request=httpx.Request("POST", args[0]),
        )

    monkeypatch.setattr(services.httpx, "post", post)
    phrase = {"text": "Keep your chest a little more upright."}
    for _ in range(13):
        response = client.post("/api/coaching/speech", json=phrase)
        assert response.status_code == 200
        assert response.content == b"test-audio"
    assert len(calls) == 1


def test_speech_request_abuse_rate_limit_applies_to_cache_hits(client, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(settings, "elevenlabs_voice_id", "test-voice")

    def post(*args, **kwargs):
        return httpx.Response(
            200,
            content=b"test-audio",
            headers={"content-type": "audio/mpeg"},
            request=httpx.Request("POST", args[0]),
        )

    monkeypatch.setattr(services.httpx, "post", post)
    phrase = {"text": "Keep your chest a little more upright."}
    for _ in range(60):
        assert client.post("/api/coaching/speech", json=phrase).status_code == 200
    assert client.post("/api/coaching/speech", json=phrase).status_code == 429


def _session_with_faults(client, fault_code, faulted_reps, total_reps, ended_at, weight_kg=None):
    """Create a completed session whose first `faulted_reps` reps carry `fault_code`."""
    from uuid import uuid4

    session_id = str(uuid4())
    payload = {
        "id": session_id,
        "workout_id": session_id,
        "workout_name": "Leg day",
        "weight_kg": weight_kg,
        "target_sets": 1,
        "target_reps": total_reps,
        "exercise": "squat",
        "source": "camera",
        "started_at": (ended_at - timedelta(minutes=2)).isoformat(),
    }
    assert client.post("/api/workouts", json=payload).status_code == 201
    sid = session_id
    reps = []
    for number in range(1, total_reps + 1):
        payload = rep(number)
        payload["completed_at"] = (
            ended_at - timedelta(seconds=(total_reps - number) * 5 + 5)
        ).isoformat()
        if number <= faulted_reps:
            payload["faults_json"] = [
                {"code": fault_code, "message": "m", "severity": "warning"}
            ]
        reps.append(payload)
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": reps}).status_code == 200
    ranges = [{
        "set_number": 1,
        "start_rep": 1,
        "end_rep": total_reps,
        "completed_at": reps[-1]["completed_at"],
        "rest_seconds": 60,
    }]
    assert client.patch(
        f"/api/workouts/{sid}",
        json={"ended_at": ended_at.isoformat(), "set_ranges": ranges},
    ).status_code == 200
    return sid


class _FakeGemini:
    def __init__(self, calls, valid):
        self._calls = calls
        self._valid = valid

    def __call__(self, **kwargs):
        outer = self

        class Client:
            def __init__(self, **kw):
                self.models = self

            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def generate_content(self, **kwargs):
                outer._calls.append(kwargs)
                return SimpleNamespace(text=json.dumps(outer._valid))

        return Client(**kwargs)


def test_insight_history_trends_and_previous_focus(client, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    now = datetime.now(timezone.utc)
    prior1 = _session_with_faults(
        client, "insufficient_depth", 1, 4, now - timedelta(days=3), weight_kg=40
    )
    _session_with_faults(
        client, "insufficient_depth", 1, 4, now - timedelta(days=2), weight_kg=45
    )
    prior_focus = {
        "recap": "Prior recap.",
        "strengths": [],
        "improvements": [],
        "next_focus": "Sit deeper on the last reps.",
    }
    calls = []
    monkeypatch.setattr(services.genai, "Client", _FakeGemini(calls, prior_focus))
    assert client.post(f"/api/workouts/{prior1}/insights").status_code == 200

    current_valid = {
        "recap": "Current recap.",
        "strengths": [],
        "improvements": [],
        "next_focus": "Keep the chest tall.",
    }
    monkeypatch.setattr(services.genai, "Client", _FakeGemini(calls, current_valid))
    current = _session_with_faults(
        client, "insufficient_depth", 3, 6, now - timedelta(minutes=1), weight_kg=50
    )
    response = client.post(f"/api/workouts/{current}/insights")
    assert response.status_code == 200, response.text
    payload = json.loads(calls[-1]["contents"].split("Session evidence:\n", 1)[1])
    history = payload["history"]
    assert [s["totalReps"] for s in history["recentSessions"]] == [4, 4]
    assert history["recentSessions"][0]["weightKg"] == 45
    assert history["recentSessions"][0]["completedSets"] == 1
    assert history["comparisonToMostRecent"] == {
        "priorDate": (now - timedelta(days=2)).date().isoformat(),
        "repDelta": 2,
        "setDelta": 0,
        "weightKgDelta": 5,
        "cleanPercentagePointDelta": -25,
        "averageMinAngleDelta": 0,
        "averageRomDelta": None,
        "averageDurationMsDelta": 0,
    }
    trends = {t["label"]: t for t in history["faultTrends"]}
    assert trends["Shallow depth"]["trend"] == "recurring"
    assert trends["Shallow depth"]["priorSessionsAffected"] == 2
    assert history["previousFocus"] == "Sit deeper on the last reps."
    assert "history.previousFocus" in calls[-1]["contents"]
    assert "history.comparisonToMostRecent" in calls[-1]["contents"]


def test_insight_refresh_regenerates_stored_result(client, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    sid = completed_session(client)
    calls = []
    first = {"recap": "First.", "strengths": [], "improvements": [], "next_focus": "A."}
    monkeypatch.setattr(services.genai, "Client", _FakeGemini(calls, first))
    assert client.post(f"/api/workouts/{sid}/insights").json()["recap"] == "First."
    assert client.post(f"/api/workouts/{sid}/insights").json()["recap"] == "First."
    assert len(calls) == 1

    second = {"recap": "Second.", "strengths": [], "improvements": [], "next_focus": "B."}
    monkeypatch.setattr(services.genai, "Client", _FakeGemini(calls, second))
    response = client.post(f"/api/workouts/{sid}/insights?refresh=true")
    assert response.status_code == 200, response.text
    assert response.json()["recap"] == "Second."
    assert len(calls) == 2
    assert client.get(f"/api/workouts/{sid}").json()["insight"]["recap"] == "Second."
    assert client.post(f"/api/workouts/{sid}/insights").json()["recap"] == "Second."
    assert len(calls) == 2


def test_fault_trends_labels_new_improving_and_ongoing():
    current = [
        {"code": "a", "label": "A", "count": 3, "percent": 50},
        {"code": "b", "label": "B", "count": 2, "percent": 10},
        {"code": "c", "label": "C", "count": 1, "percent": 20},
    ]
    prior = [
        {"faults": [{"code": "b", "percent": 40}, {"code": "c", "percent": 20}]},
        {"faults": [{"code": "b", "percent": 50}]},
    ]
    trends = {t["label"]: t["trend"] for t in services._fault_trends(current, prior)}
    assert trends == {"A": "new", "B": "improving", "C": "ongoing"}
