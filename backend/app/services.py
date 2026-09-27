import hashlib
import json
import math
import time
from collections import OrderedDict
from concurrent.futures import Future
from pathlib import Path
from threading import Lock
from typing import Callable

import httpx
from fastapi import HTTPException
from google import genai
from sqlalchemy import select

from app.models import SessionInsight, Workout
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


# Cloud voice pace: a touch faster than the provider default so short coaching
# cues land crisply between reps. Part of the disk-cache key so a speed change
# never serves audio rendered at the old speed.
SPEECH_SPEED = 1.1


def _voice_file(text: str) -> Path:
    key = hashlib.sha256(f"{settings.elevenlabs_voice_id}:{SPEECH_SPEED}:{text}".encode()).hexdigest()
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
                json={
                    "text": text,
                    "model_id": "eleven_flash_v2_5",
                    "voice_settings": {"speed": SPEECH_SPEED},
                },
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


def _rep_metric(rep, key):
    value = rep.metrics_json.get(key)
    return value if isinstance(value, (int, float)) and math.isfinite(value) else None


def _finite(values):
    return [value for value in values if value is not None]


def _average(values):
    return sum(values) / len(values) if values else None


def _stddev(values):
    if len(values) < 2:
        return None
    mean = sum(values) / len(values)
    return math.sqrt(sum((value - mean) ** 2 for value in values) / len(values))


def _clean_streak(reps):
    longest = current = 0
    for rep in reps:
        if rep.faults_json:
            current = 0
        else:
            current += 1
            longest = max(longest, current)
    return longest


def _fault_code(fault):
    return fault["code"] if isinstance(fault, dict) else fault.code


def _fault_timing(rep_numbers, total):
    thirds = set()
    for number in rep_numbers:
        ratio = number / max(total, 1)
        thirds.add("early" if ratio <= 1 / 3 else "late" if ratio > 2 / 3 else "middle")
    return "throughout" if len(thirds) > 1 else next(iter(thirds), "throughout")


# Plain-language meanings for analyzer fault codes. Mirrors the frontend's
# cueLabel map so the coach and the tracker describe the same thing.
FAULT_LABELS = {
    "insufficient_depth": "Shallow depth",
    "excessive_forward_lean": "Forward lean",
    "limited_range": "Limited range of motion",
    "upper_arm_movement": "Upper arm moving",
    "hip_alignment": "Hips out of alignment",
    "excessive_back_rounding": "Back rounding",
    "insufficient_hinge": "Shallow hinge",
    "knee_over_toes": "Knees past toes",
    "excessive_back_arch": "Back arching",
    "incomplete_extension": "Incomplete extension",
    "incomplete_pull": "Incomplete pull",
    "torso_rising": "Torso lifting early",
    "excessive_swing": "Body swing",
}


def _summarize_faults(reps, total):
    by_code = {}
    for rep in reps:
        seen = set()
        for fault in rep.faults_json:
            code = _fault_code(fault)
            if code in seen:
                continue
            seen.add(code)
            entry = by_code.setdefault(code, {"reps": []})
            entry["reps"].append(rep.rep_number)
    summaries = []
    for code, entry in by_code.items():
        rep_numbers = sorted(entry["reps"])
        summaries.append(
            {
                "code": code,
                "label": FAULT_LABELS.get(code, code),
                "count": len(rep_numbers),
                "percent": round(len(rep_numbers) / total * 100) if total else 0,
                "reps": rep_numbers,
                "timing": _fault_timing(rep_numbers, total),
            }
        )
    return sorted(summaries, key=lambda row: (-row["count"], row["code"]))


def _depth_trend(measured):
    """First-third vs last-third minimum-angle averages; None when too few measurements."""
    if len(measured) < 3:
        return None
    group = max(1, len(measured) // 3)
    first = measured[:group]
    last = measured[-group:]
    first_average = _average([value for _, value in first])
    last_average = _average([value for _, value in last])
    if first_average is None or last_average is None:
        return None
    return {
        "firstReps": [number for number, _ in first],
        "firstAverage": round(first_average, 1),
        "lastReps": [number for number, _ in last],
        "lastAverage": round(last_average, 1),
        "change": round(last_average - first_average, 1),
    }


def _workout_summary(workout, user=None) -> dict:
    """The full measured picture of a workout, sent to Gemini for coaching analysis."""
    reps = sorted(workout.reps, key=lambda rep: rep.rep_number)
    total = len(reps)
    measured = []
    clean_measured = []
    for rep in reps:
        value = _rep_metric(rep, "min_angle")
        if value is None:
            continue
        measured.append((rep.rep_number, value))
        if not rep.faults_json:
            clean_measured.append((rep.rep_number, value))
    roms = []
    for rep in reps:
        low = _rep_metric(rep, "min_angle")
        high = _rep_metric(rep, "max_angle")
        if low is not None and high is not None and high >= low:
            roms.append(high - low)
    durations = _finite(_rep_metric(rep, "duration_ms") for rep in reps)
    eccentric = _finite(_rep_metric(rep, "eccentric_ms") for rep in reps)
    concentric = _finite(_rep_metric(rep, "concentric_ms") for rep in reps)
    best = min(clean_measured, key=lambda row: row[1], default=None)
    min_values = [value for _, value in measured]

    notes = []
    if total and len(measured) < total:
        notes.append(f"min_angle missing on {total - len(measured)} of {total} reps")
    if total and not roms:
        notes.append("no range-of-motion data recorded (older app version)")
    if total and not eccentric:
        notes.append("no eccentric/concentric tempo split recorded (older app version)")

    average_min = _average(min_values)
    average_rom = _average(roms)
    average_duration = _average(durations)
    stddev = _stddev(min_values)
    athlete = {}
    if user is not None:
        if getattr(user, "fitness_goal", None):
            athlete["fitness_goal"] = user.fitness_goal
        if getattr(user, "experience_level", None):
            athlete["experience_level"] = user.experience_level
    summary = {
        "exercise": workout.exercise,
        "source": workout.source,
        "repCountUnit": "individual arm repetitions"
        if any("arm_side" in rep.metrics_json for rep in reps)
        else "movement cycles",
        "totals": {
            "reps": total,
            "measuredReps": len(measured),
            "cleanReps": sum(1 for rep in reps if not rep.faults_json),
            "longestCleanStreak": _clean_streak(reps),
        },
        "training": {
            "weightKg": getattr(workout, "weight_kg", None),
            "targetSets": getattr(workout, "target_sets", None),
            "targetRepsPerSet": getattr(workout, "target_reps", None),
            "completedSets": len(getattr(workout, "set_ranges", None) or []),
            "sets": getattr(workout, "set_ranges", None) or [],
        },
        "range": {
            "averageMinAngle": round(average_min, 1) if average_min is not None else None,
            "minAngleStdDev": round(stddev, 1) if stddev is not None else None,
            "averageRom": round(average_rom, 1) if average_rom is not None else None,
            "bestRep": {"rep": best[0], "minAngle": best[1]} if best else None,
            "trend": _depth_trend(measured),
        },
        "tempo": {
            "averageMs": round(average_duration) if average_duration is not None else None,
            "spreadMs": round(max(durations) - min(durations)) if durations else None,
            "averageEccentricMs": round(_average(eccentric))
            if eccentric
            else None,
            "averageConcentricMs": round(_average(concentric))
            if concentric
            else None,
        },
        "faults": _summarize_faults(reps, total),
        "notes": notes,
    }
    if athlete:
        summary["athlete"] = athlete
    return summary


def _fault_trends(current_faults, prior_sessions):
    """Label each of the current session's top faults as new, recurring, improving, or ongoing.

    current_faults: [{"code", "label", "count", "percent"}, ...] sorted by count desc.
    prior_sessions: [{"faults": [{"code", "percent"}, ...]}, ...] most recent first.
    """
    trends = []
    for fault in current_faults[:3]:
        hits = [s for s in prior_sessions if any(f["code"] == fault["code"] for f in s["faults"])]
        prior_percents = [f["percent"] for s in hits for f in s["faults"] if f["code"] == fault["code"]]
        prior_avg = round(sum(prior_percents) / len(prior_percents)) if prior_percents else 0
        if not hits:
            trend = "new"
        elif fault["percent"] < prior_avg * 0.7:
            trend = "improving"
        elif len(hits) >= 2:
            trend = "recurring"
        else:
            trend = "ongoing"
        trends.append(
            {
                "label": fault["label"],
                "trend": trend,
                "priorSessionsAffected": len(hits),
                "priorAveragePercent": prior_avg,
                "currentPercent": fault["percent"],
            }
        )
    return trends


def insight_history(db, user_id, workout, limit=3):
    """Cross-session context for insight generation: recent sessions, fault trends,
    and the most recent prior next_focus so the coach doesn't repeat itself."""
    prior = (
        db.scalars(
            select(Workout)
            .where(
                Workout.user_id == user_id,
                Workout.status == "completed",
                Workout.id != workout.id,
                Workout.source != "demo",
            )
            .order_by(Workout.ended_at.desc())
            .limit(limit)
        )
        .all()
    )
    recent = []
    for session in prior:
        summary = _summarize_faults(session.reps, len(session.reps))
        recent.append(
            {
                "exercise": session.exercise,
                "date": session.ended_at.date().isoformat() if session.ended_at else None,
                "totalReps": len(session.reps),
                "faults": [
                    {"code": f["code"], "label": f["label"], "percent": f["percent"]}
                    for f in summary[:3]
                ],
            }
        )
    current = _workout_summary(workout)
    previous_focus = None
    for same_exercise in (True, False):
        row = db.scalar(
            select(SessionInsight)
            .join(Workout, SessionInsight.session_id == Workout.id)
            .where(
                Workout.user_id == user_id,
                Workout.id != workout.id,
                Workout.status == "completed",
                Workout.source != "demo",
                *([Workout.exercise == workout.exercise] if same_exercise else []),
            )
            .order_by(Workout.ended_at.desc())
        )
        if row and row.summary_json:
            previous_focus = row.summary_json.get("next_focus")
            if previous_focus:
                break
    return {
        "recentSessions": recent,
        "faultTrends": _fault_trends(current["faults"], recent),
        "previousFocus": previous_focus,
    }


def generate_insight(workout, user=None, history=None) -> dict:
    if not settings.gemini_api_key:
        raise HTTPException(503, "Gemini is not configured. Measured statistics remain available.")
    summary = _workout_summary(workout, user)
    if history:
        summary["history"] = history
        history_guidance = (
            "Use history.faultTrends to note whether each top fault is new, recurring, "
            "improving, or ongoing compared with recent sessions, and mention the trend "
            "in your coaching. Do not repeat history.previousFocus as the next-session "
            "focus; build on it or choose a different one. "
        )
    else:
        history_guidance = ""
    summary_json = json.dumps(summary)
    try:
        with genai.Client(
            api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=20000)
        ) as client:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=(
                    "Coach this workout session for the athlete using ONLY the measurements "
                    "below. Cite the specific rep numbers behind every observation "
                    "(e.g. 'reps 4-6'). " + history_guidance + "\n\nSession evidence:\n" + summary_json
                ),
                config=types.GenerateContentConfig(
                    system_instruction="You are a concise workout coach writing about one specific session. "
                    "Only use the supplied measurements. Do not invent measurements, assess health, "
                    "or claim injury prevention. Missing (null) measurements are unavailable. "
                    "No detected faults is not proof of perfect form. "
                    "If source is demo, explicitly describe simulated movement, not a real person's workout. "
                    "Use range.trend to note depth fading or improving across the session, tempo splits to comment "
                    "on pacing, and each fault's label, reps, and timing (early/middle/late/throughout) to say "
                    "exactly when cues appeared. Ground every claim in the evidence and cite rep numbers. "
                    "The next-session focus must target the single most important observed pattern, "
                    "not generic advice. Vary your phrasing; never pad with generic encouragement. "
                    "Keep each field concise.",
                    temperature=0.7,
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
