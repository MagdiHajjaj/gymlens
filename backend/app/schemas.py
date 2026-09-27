import re
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

Exercise = Literal["squat", "curl", "pushup", "deadlift", "lunge", "press",
                  "glute_bridge", "row", "dips", "pullup"]
MetricName = Literal["knee_angle", "elbow_angle", "left_elbow_angle", "right_elbow_angle", "torso_lean", "hip_alignment", "upper_arm_angle", "hip_angle"]
FaultCode = Literal[
    "insufficient_depth", "excessive_forward_lean", "upper_arm_movement", "hip_alignment", "limited_range",
    "insufficient_hinge", "excessive_back_rounding", "knee_over_toes", "excessive_back_arch",
    "incomplete_extension", "torso_rising", "incomplete_pull", "excessive_swing",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ProfileUpdate(StrictModel):
    display_name: str = Field(min_length=1, max_length=100)
    fitness_goal: Literal["strength", "muscle", "mobility", "general_fitness"]
    experience_level: Literal["beginner", "intermediate", "advanced"]
    preferred_units: Literal["metric", "imperial"] = "metric"
    height_cm: float | None = Field(default=None, ge=100, le=250)
    weight_kg: float | None = Field(default=None, ge=30, le=350)
    weekly_workout_target: int = Field(ge=1, le=14)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value):
        value = " ".join(value.split())
        if not value:
            raise ValueError("Display name is required")
        return value


class WorkoutCreate(StrictModel):
    id: UUID
    workout_id: UUID
    workout_name: str | None = Field(default=None, min_length=1, max_length=80)
    exercise: Exercise
    source: Literal["camera", "upload"]
    started_at: AwareDatetime


class WorkoutFinish(StrictModel):
    ended_at: AwareDatetime


class Fault(StrictModel):
    code: FaultCode
    message: str = Field(max_length=160)
    severity: Literal["info", "warning"]


class Rep(StrictModel):
    rep_number: int = Field(ge=1, le=5000)
    completed_at: AwareDatetime
    metrics_json: dict[str, float] = Field(max_length=8)
    faults_json: list[Fault] = Field(max_length=5)

    @field_validator("metrics_json")
    @classmethod
    def valid_metrics(cls, values):
        bounds = {"min_angle": (0, 180), "duration_ms": (0, 60000), "max_torso_lean": (0, 180), "arm_side": (0, 2)}
        for key, value in values.items():
            if key == "arm_side" and value not in (0, 1, 2):
                raise ValueError("Arm side must be left (0), right (1), or bilateral (2)")
            if key not in bounds or not bounds[key][0] <= value <= bounds[key][1]:
                raise ValueError("Unsupported metric or value")
        return values


class RepBatch(StrictModel):
    reps: list[Rep] = Field(max_length=100)


class Metric(StrictModel):
    recorded_at: AwareDatetime
    metric_name: MetricName
    metric_value: float = Field(ge=0, le=180)


class MetricBatch(StrictModel):
    metrics: list[Metric] = Field(max_length=500)


class MetricSummary(StrictModel):
    bucket: AwareDatetime
    metric_name: MetricName
    average: float
    minimum: float
    maximum: float
    samples: int = Field(ge=1)


PHRASES = {
    "Voice coach is ready. Let's get moving.",
    "Rep complete. Keep your movement controlled.",
    "Ready. Move at a comfortable, controlled pace.",
    "Keep your chest a little more upright.",
    "Keep your upper arm close to your side.",
    "Keep your shoulders, hips, and ankles in line.",
    "Try a little more depth within your comfortable range.",
    "Try a fuller range of motion at a comfortable pace.",
    "2. Settle into your pace.",
    "3. Stay controlled.",
    "4. Keep the rhythm.",
    "5. Control the return.",
    "10. Keep the rhythm.",
    "Ready.",
    "Step back so your full movement is visible.",
    "Keep your shoulder, elbow, and wrist in frame. Move the camera back if your hand is cropped.",
    "Waiting for a fresh camera frame.",
    "Keep the same arm or leg in view. Reacquiring tracking.",
    "Turn side-on to the camera for this exercise.",
    "Move into clear view of the camera.",
    "Hold your starting position to calibrate.",
    "Keep your movement steady and controlled.",
    "Reset your starting position before your next rep.",
    "Curl your hand toward your shoulder. Keep your elbow steady.",
    "Lower your hand back to a comfortably straight arm to finish the rep.",
    "Reacquiring arm.",
    "Keep your shoulders and elbows in view so the tracker can see the movement.",
    "Lower your arms and pause for a second to start clean.",
    "One arm is visible. Keep both hands in frame to track both sides.",
    "Both arms are tracked. Curl together or alternate, then lower each arm to finish the rep.",
    "Stand side-on with your joints extended.",
    "Lower your hand until your arm is comfortably straight. Hold briefly to start.",
    "Hold a side-on plank with arms extended.",
    "Stand side-on, then hinge at the hips with a flat back.",
    "Stand side-on, arms extended overhead.",
    "Lie on your back and hold the top of your bridge.",
    "Hinge at the hips and let your arms hang. Hold still to calibrate.",
    "Press up into support with arms extended. Hold still to calibrate.",
    "Hang from the bar with arms fully extended.",
    "Keep your back flat — hinge at the hips, chest proud.",
    "Hinge deeper at the hips within your comfortable range.",
    "Keep your front knee behind your toes.",
    "Keep your ribs down — don't arch your back.",
    "Keep your ribs down — squeeze your glutes, not your low back.",
    "Lower your hips all the way down, then drive up to a full bridge.",
    "Keep your torso still — don't stand up to pull the weight.",
    "Pull your elbow all the way up toward your hip.",
    "Keep your torso upright — don't pitch forward over your hands.",
    "Lower a little deeper within your comfortable range.",
    "Keep your body still — don't swing or kip.",
    "Pull all the way up — chin over the bar.",
}

SET_FOCUS_PHRASES = {
    "Sit a little deeper next set.",
    "Keep your chest more upright next set.",
    "Keep your upper arm steady next set.",
    "Keep shoulders, hips, and ankles aligned.",
    "Use a fuller comfortable range next set.",
    "Keep your back flat next set.",
    "Hinge deeper at the hips next set.",
    "Keep your front knee behind your toes next set.",
    "Keep your ribs down next set.",
    "Drive up to a full bridge next set.",
    "Pull all the way up next set.",
    "Keep your torso still next set.",
    "Keep your body still next set.",
}
SESSION_FOCUS_PHRASES = {
    "Focus on comfortable depth next session.",
    "Focus on an upright chest next session.",
    "Focus on a steady upper arm next session.",
    "Focus on shoulder, hip, and ankle alignment.",
    "Focus on a fuller comfortable range next session.",
    "Focus on a flat back next session.",
    "Focus on a deeper hip hinge next session.",
    "Focus on knee position next session.",
    "Focus on keeping your ribs down next session.",
    "Focus on full hip extension next session.",
    "Focus on a complete pull next session.",
    "Focus on a steady torso next session.",
    "Focus on a still body next session.",
}

NUMERIC_PHRASE = re.compile(r"(?:[1-9]|[1-9][0-9]{1,2}|[1-4][0-9]{3}|5000)\.")
REST_PHRASE = re.compile(r"Rest (?:30|60|90) seconds\.")
SET_GO_PHRASE = re.compile(r"Set (?P<set>[1-9]|[1-9][0-9]), go\.")
REP_COMPLETE_PHRASE = re.compile(
    r"Rep (?P<rep>[1-9]|[1-9][0-9]{1,2}|[1-4][0-9]{3}|5000) complete\."
    r"(?: Bottom angle (?P<angle>[0-9]|[1-9][0-9]|1[0-7][0-9]|180) degrees\.)?"
)
READY_PROGRESS_PHRASE = re.compile(
    r"Ready\. (?P<reps>[1-9]|[1-9][0-9]{1,2}|[1-4][0-9]{3}|5000) (?P<unit>rep|reps) so far\."
)
SET_SUMMARY = re.compile(
    r"Set (?P<set>[1-9]|[1-9][0-9]) complete\. "
    r"(?P<reps>[0-9]{1,4}) (?P<unit>rep|reps|arm rep|arm reps)\. (?P<detail>.+)"
)
SESSION_SUMMARY = re.compile(
    r"Session complete\. (?P<reps>[0-9]{1,4}) (?P<unit>rep|reps|arm rep|arm reps) across "
    r"(?P<sets>[0-9]{1,2}) (?P<set_unit>set|sets)\. (?P<detail>.+)"
)
EMPTY_SESSION_SUMMARY = re.compile(
    r"Session complete\. No (?:squat|bicep curl|push-up|romanian deadlift|lunge|overhead press|glute bridge|bent-over row|tricep dips|pull-up) reps were recorded\."
)
TECHNIQUE_DETAIL = re.compile(
    r"(?P<count>[1-9]|[1-9][0-9]{1,2}|[1-4][0-9]{3}|5000) "
    r"technique (?P<unit>cue|cues)\. (?P<focus>.+)"
)


def _bounded(raw: str, maximum: int, allow_zero: bool = True) -> int | None:
    value = int(raw)
    return value if (allow_zero or value > 0) and value <= maximum else None


def _count_unit(count: int, unit: str, singular: str, plural: str) -> bool:
    return unit == (singular if count == 1 else plural)


def _technique_detail(detail: str, focus_phrases: set[str]) -> bool:
    if detail == "No technique cues detected.":
        return True
    match = TECHNIQUE_DETAIL.fullmatch(detail)
    if not match:
        return False
    count = _bounded(match["count"], 5000, allow_zero=False)
    return bool(
        count
        and _count_unit(count, match["unit"], "cue", "cues")
        and match["focus"] in focus_phrases
    )


def _summary(value: str) -> bool:
    match = SET_SUMMARY.fullmatch(value)
    if match:
        reps = _bounded(match["reps"], 5000)
        valid_reps = reps is not None and (
            _count_unit(reps, match["unit"], "rep", "reps")
            or _count_unit(reps, match["unit"], "arm rep", "arm reps")
        )
        return valid_reps and _technique_detail(match["detail"], SET_FOCUS_PHRASES)
    match = SESSION_SUMMARY.fullmatch(value)
    if not match:
        return False
    reps = _bounded(match["reps"], 5000)
    sets = _bounded(match["sets"], 99)
    valid_reps = reps is not None and (
        _count_unit(reps, match["unit"], "rep", "reps")
        or _count_unit(reps, match["unit"], "arm rep", "arm reps")
    )
    return bool(
        valid_reps
        and sets is not None
        and _count_unit(sets, match["set_unit"], "set", "sets")
        and _technique_detail(match["detail"], SESSION_FOCUS_PHRASES)
    )


def approved_speech(value: str) -> bool:
    ready = READY_PROGRESS_PHRASE.fullmatch(value)
    ready_valid = bool(
        ready
        and _count_unit(int(ready["reps"]), ready["unit"], "rep", "reps")
    )
    return (
        value in PHRASES
        or bool(NUMERIC_PHRASE.fullmatch(value))
        or bool(REST_PHRASE.fullmatch(value))
        or bool(SET_GO_PHRASE.fullmatch(value))
        or bool(REP_COMPLETE_PHRASE.fullmatch(value))
        or ready_valid
        or bool(EMPTY_SESSION_SUMMARY.fullmatch(value))
        or _summary(value)
    )


class SpeechRequest(StrictModel):
    text: str = Field(max_length=160)

    @field_validator("text")
    @classmethod
    def approved(cls, value):
        if not approved_speech(value):
            raise ValueError("Choose an approved coaching phrase")
        return value


class Insight(StrictModel):
    recap: str = Field(min_length=1, max_length=800)
    strengths: list[str] = Field(max_length=5)
    improvements: list[str] = Field(max_length=5)
    next_focus: str = Field(min_length=1, max_length=400)
