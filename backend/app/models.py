import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def now():
    return datetime.now(UTC)


def uid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    auth0_sub: Mapped[str] = mapped_column(String(255), unique=True)
    display_name: Mapped[str] = mapped_column(String(100), default="Gym Lens member")
    fitness_goal: Mapped[str | None] = mapped_column(String(30), nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    preferred_units: Mapped[str] = mapped_column(String(10), default="metric")
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    weekly_workout_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    profile_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Workout(Base):
    __tablename__ = "workout_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    workout_id: Mapped[str] = mapped_column(String(36), index=True)
    workout_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    exercise: Mapped[str] = mapped_column(String(20))
    source: Mapped[str] = mapped_column(String(20), default="camera")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_reps: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")
    reps: Mapped[list["RepEvent"]] = relationship(
        cascade="all, delete-orphan", order_by="RepEvent.rep_number"
    )
    metrics: Mapped[list["MovementMetric"]] = relationship(
        cascade="all, delete-orphan", order_by="MovementMetric.recorded_at"
    )
    insight_row: Mapped["SessionInsight | None"] = relationship(cascade="all, delete-orphan", uselist=False)


class RepEvent(Base):
    __tablename__ = "rep_events"
    __table_args__ = (UniqueConstraint("session_id", "rep_number"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("workout_sessions.id"), index=True)
    rep_number: Mapped[int]
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    metrics_json: Mapped[dict] = mapped_column(JSON)
    faults_json: Mapped[list] = mapped_column(JSON)


class MovementMetric(Base):
    __tablename__ = "movement_metrics"
    __table_args__ = (Index("ix_metrics_session_time", "session_id", "recorded_at"),)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("workout_sessions.id"), primary_key=True)
    metric_name: Mapped[str] = mapped_column(String(40), primary_key=True)
    metric_value: Mapped[float]


class SessionInsight(Base):
    __tablename__ = "session_insights"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("workout_sessions.id"), unique=True)
    summary_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
