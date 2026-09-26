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
    ]
    for text in valid:
        assert SpeechRequest(text=text).text == text


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
    assert '"totalReps": 1' in calls[0]["contents"]
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


def test_costly_endpoint_provider_miss_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")
    for _ in range(12):
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
