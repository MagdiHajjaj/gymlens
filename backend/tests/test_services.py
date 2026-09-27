from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
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


def test_voice_phrase_grammar_allows_bounded_coach_phrases():
    valid = [
        "Voice coach is ready. Let's get moving.",
        "1.",
        "5000.",
        "3. Stay controlled.",
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
        # The coach no longer composes prefix + fault message; only the
        # exact allowlisted phrasings may be spoken.
        "Reset your position. Keep your upper arm close to your side.",
        "Slow the next rep down. Keep your upper arm close to your side.",
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
    text = "3. Stay controlled."
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
    text = "4. Keep the rhythm."
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
    payload = json.loads(calls[0]["contents"].split("statistics: ", 1)[1])
    assert payload["exercise"] == "squat"
    assert payload["totals"]["reps"] == 1
    assert payload["range"]["averageMinAngle"] == 92
    assert payload["tempo"]["averageMs"] == 2500
    config = calls[0]["config"]
    assert config.response_schema is None
    assert config.response_json_schema["additionalProperties"] is False
    assert set(config.response_json_schema["required"]) == {
        "recap", "strengths", "improvements", "next_focus"
    }
    assert client.post(f"/api/workouts/{sid}/insights").json() == response.json()
    assert len(calls) == 1
    assert client.get(f"/api/workouts/{sid}").json()["insight"]["recap"] == valid["recap"]


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
    assert services._workout_summary(workout)["repCountUnit"] == "individual arm repetitions"


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
