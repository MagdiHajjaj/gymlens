from datetime import datetime, timezone
from types import SimpleNamespace
import json
import httpx
from app import services
from app.core.config import settings
from test_workouts import create, rep


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


def test_costly_endpoint_rate_limit(client, monkeypatch):
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
