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


class WorkoutCreate(StrictModel):
    id: UUID
    exercise: Exercise
    source: Literal["camera", "demo", "upload"]
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
        bounds = {"min_angle": (0, 180), "duration_ms": (0, 60000), "max_torso_lean": (0, 180), "arm_side": (0, 1)}
        for key, value in values.items():
            if key == "arm_side" and value not in (0, 1):
                raise ValueError("Arm side must be left (0) or right (1)")
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
}


class SpeechRequest(StrictModel):
    text: str = Field(max_length=160)

    @field_validator("text")
    @classmethod
    def approved(cls, value):
        if value not in PHRASES:
            raise ValueError("Choose an approved coaching phrase")
        return value


class Insight(StrictModel):
    recap: str = Field(min_length=1, max_length=800)
    strengths: list[str] = Field(max_length=5)
    improvements: list[str] = Field(max_length=5)
    next_focus: str = Field(min_length=1, max_length=400)
