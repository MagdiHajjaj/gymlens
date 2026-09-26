import hashlib
import json
import time
from collections import Counter, OrderedDict
from concurrent.futures import Future
from pathlib import Path
from threading import Lock
from typing import Callable

import httpx
from fastapi import HTTPException
from google import genai
from google.genai import types

from app.core.config import settings
from app.schemas import Insight

_lock = Lock()
_requests: OrderedDict = OrderedDict()
# In-memory LRU: bounds memory while the server runs; the disk cache below survives restarts.
_AUDIO_CACHE_MAX_ENTRIES = 128
_AUDIO_CACHE_MAX_BYTES = 32 * 1024 * 1024
_audio: OrderedDict[str, bytes] = OrderedDict()
_speech_inflight: dict[str, Future[bytes]] = {}
# ElevenLabs audio is also saved to disk, so each phrase is paid for once, not once per restart.
VOICE_CACHE = Path(__file__).resolve().parent.parent / ".voice-cache"
# After a provider failure (quota, rate limit, outage), stop calling it for a while.
VOICE_BACKOFF_SECONDS = 120
_voice_down_until = 0.0


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


def _voice_file(text: str) -> Path:
    key = hashlib.sha256(f"{settings.elevenlabs_voice_id}:{text}".encode()).hexdigest()
    return VOICE_CACHE / f"{key}.mp3"


def _cache_audio(text: str, content: bytes):
    with _lock:
        _audio.pop(text, None)
        _audio[text] = content
        while len(_audio) > _AUDIO_CACHE_MAX_ENTRIES or sum(map(len, _audio.values())) > _AUDIO_CACHE_MAX_BYTES:
            _audio.popitem(last=False)


def speech_cached(text: str) -> bool:
    with _lock:
        cached = text in _audio
        if cached:
            _audio.move_to_end(text)
        return cached


def speech(text: str, before_provider: Callable[[], None] | None = None) -> bytes:
    global _voice_down_until
    with _lock:
        cached = _audio.get(text)
        if cached is not None:
            _audio.move_to_end(text)
            return cached
        inflight = _speech_inflight.get(text)
        leader = inflight is None
        if leader:
            inflight = Future()
            _speech_inflight[text] = inflight
    if not leader:
        return inflight.result()
    try:
        # Disk cache survives restarts; a hit here never touches the provider budget.
        disk = _voice_file(text)
        try:
            if disk.is_file():
                content = disk.read_bytes()
                _cache_audio(text, content)
                inflight.set_result(content)
                return content
        except OSError:
            pass  # Unreadable disk cache: fall through to the provider.
        if before_provider:
            before_provider()
        if not settings.elevenlabs_api_key or not settings.elevenlabs_voice_id:
            raise HTTPException(503, "Voice provider is unavailable; use browser speech")
        if time.monotonic() < _voice_down_until:
            raise HTTPException(503, "Voice provider is cooling down; browser speech is available")
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
        except (httpx.HTTPError, ValueError):
            _voice_down_until = time.monotonic() + VOICE_BACKOFF_SECONDS
            raise HTTPException(503, "Voice provider unavailable; browser speech is available") from None
        _cache_audio(text, response.content)
        try:
            VOICE_CACHE.mkdir(exist_ok=True)
            disk.write_bytes(response.content)
        except OSError:
            pass  # Read-only disk: the in-memory cache still applies.
        inflight.set_result(response.content)
        return response.content
    except Exception as error:
        inflight.set_exception(error)
        raise
    finally:
        with _lock:
            if _speech_inflight.get(text) is inflight:
                del _speech_inflight[text]


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
