import json
import time
from collections import Counter, OrderedDict
from threading import Lock

import httpx
from fastapi import HTTPException
from google import genai
from google.genai import types

from app.core.config import settings
from app.schemas import Insight

_lock = Lock()
_requests: OrderedDict = OrderedDict()
_audio: dict[str, bytes] = {}


def rate_limit(subject: str, kind: str, maximum: int):
    # Single-process defense. Add gateway limits before deploying multiple workers.
    now = time.monotonic()
    with _lock:
        key = (subject, kind)
        recent = [t for t in _requests.pop(key, []) if now - t < 60]
        _requests[key] = recent
        while len(_requests) > 10000:
            _requests.popitem(last=False)
        if len(recent) >= maximum:
            raise HTTPException(429, "Please wait before trying again", headers={"Retry-After": "60"})
        recent.append(now)


def speech(text: str) -> bytes:
    if text in _audio:
        return _audio[text]
    if not settings.elevenlabs_api_key or not settings.elevenlabs_voice_id:
        raise HTTPException(503, "Voice provider is unavailable; use browser speech")
    try:
        response = httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}",
            headers={"xi-api-key": settings.elevenlabs_api_key, "Accept": "audio/mpeg"},
            json={"text": text, "model_id": "eleven_flash_v2_5"},
            timeout=15,
        )
        response.raise_for_status()
        if not response.headers.get("content-type", "").startswith("audio/") or not response.content:
            raise ValueError("Invalid audio response")
        _audio[text] = response.content
        return response.content
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Voice provider unavailable; browser speech is available") from None


def generate_insight(workout) -> dict:
    if not settings.gemini_api_key:
        raise HTTPException(503, "Gemini is not configured. Measured statistics remain available.")
    counts = Counter(f["code"] for rep in workout.reps for f in rep.faults_json)
    depths = [r.metrics_json["min_angle"] for r in workout.reps if "min_angle" in r.metrics_json]
    summary = {
        "exercise": workout.exercise,
        "source": workout.source,
        "totalReps": len(workout.reps),
        "repCountUnit": "individual arm repetitions" if any(
            "arm_side" in rep.metrics_json for rep in workout.reps
        ) else "movement cycles",
        "repsWithDetectedFaults": sum(bool(r.faults_json) for r in workout.reps),
        "commonFaults": dict(counts),
        "measuredMetrics": {
            "averageMinimumJointAngle": round(sum(depths) / len(depths), 1) if depths else None
        },
    }
    try:
        with genai.Client(
            api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=20000)
        ) as client:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents="Summarize only these observed exercise statistics: " + json.dumps(summary),
                config=types.GenerateContentConfig(
                    system_instruction="You are a concise workout coach. Only use the supplied measurements. "
                    "Do not invent measurements, assess health, or claim injury prevention. "
                    "Missing measurements are unavailable. No detected faults is not proof of perfect form. "
                    "If source is demo, explicitly describe simulated movement, not a real person's workout. "
                    "Give one practical next-session focus; keep each field concise.",
                    response_mime_type="application/json",
                    response_json_schema=Insight.model_json_schema(),
                ),
            )
            result = Insight.model_validate_json(response.text or "")
            return {**result.model_dump(), "source": "gemini"}
    except Exception:
        raise HTTPException(
            503, "Insights are temporarily unavailable. Your workout is saved; retry later."
        ) from None
