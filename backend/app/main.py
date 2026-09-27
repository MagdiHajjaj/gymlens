from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from app import services
from app.core.config import settings
from app.core.database import Base, engine, get_db
from app.core.security import current_subject, optional_subject
from app.models import MovementMetric, RepEvent, SessionInsight, User, Workout
from app.schemas import (
    MetricBatch,
    MetricSummary,
    ProfileUpdate,
    RepBatch,
    SpeechRequest,
    WorkoutCreate,
    WorkoutFinish,
)


@asynccontextmanager
async def lifespan(app):
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Gym Lens API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


class BodyLimit:
    def __init__(self, app, maximum=512_000):
        self.app, self.maximum = app, maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        chunks, total = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            total += len(message.get("body", b""))
            if total > self.maximum:
                return await JSONResponse({"detail": "Request body too large"}, status_code=413)(
                    scope, receive, send
                )
            chunks.append(message)
            if not message.get("more_body", False):
                break

        async def buffered():
            return chunks.pop(0) if chunks else await receive()

        await self.app(scope, buffered, send)


app.add_middleware(BodyLimit)


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def current_user(subject: str = Depends(current_subject), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.auth0_sub == subject))
    if not user:
        user = User(auth0_sub=subject)
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            user = db.scalar(select(User).where(User.auth0_sub == subject))
    return user


def owned(session_id: UUID, db: Session, user: User):
    workout = db.scalar(
        select(Workout)
        .where(Workout.id == str(session_id), Workout.user_id == user.id, Workout.source != "demo")
        .with_for_update()
    )
    if not workout:
        raise HTTPException(404, "Workout not found")
    return workout


def serialize(workout, detail=True):
    result = {
        "id": workout.id,
        "workout_id": workout.workout_id,
        "exercise": workout.exercise,
        "source": workout.source,
        "started_at": utc(workout.started_at),
        "ended_at": utc(workout.ended_at) if workout.ended_at else None,
        "status": workout.status,
        "total_reps": workout.total_reps,
    }
    if detail:
        result.update(
            reps=[
                {
                    "rep_number": r.rep_number,
                    "completed_at": utc(r.completed_at),
                    "metrics_json": r.metrics_json,
                    "faults_json": r.faults_json,
                }
                for r in workout.reps
            ],
            metrics=[
                {
                    "recorded_at": utc(m.recorded_at),
                    "metric_name": m.metric_name,
                    "metric_value": m.metric_value,
                }
                for m in workout.metrics
            ],
            insight=workout.insight_row.summary_json if workout.insight_row else None,
        )
    return result


def check_time(value, workout):
    if utc(value) < utc(workout.started_at) or utc(value) > datetime.now(UTC) + timedelta(minutes=5):
        raise HTTPException(422, "Event timestamp is outside the session")


@app.get("/health")
def health():
    return {"status": "ok", "auth_configured": bool(settings.auth0_domain and settings.auth0_audience)}


@app.get("/health/ready")
def ready(db: Session = Depends(get_db)):
    """Render readiness check: only route traffic when the database responds."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(503, "Database is unavailable") from None
    return {"status": "ready"}


@app.get("/api/platform/tiger")
def tiger_status(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Report database capabilities without exposing connection details."""
    del user
    if db.bind.dialect.name != "postgresql":
        return {"connected": False, "database": "sqlite", "timescale": False, "continuous_aggregate": False}
    timescale = bool(
        db.scalar(text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb')"))
    )
    aggregate = bool(db.scalar(text("SELECT to_regclass('movement_metrics_1m') IS NOT NULL")))
    return {"connected": True, "database": "postgresql", "timescale": timescale,
            "continuous_aggregate": aggregate}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return serialize_profile(user)


def serialize_profile(user: User):
    return {
        "id": user.id,
        "display_name": user.display_name,
        "fitness_goal": user.fitness_goal,
        "experience_level": user.experience_level,
        "preferred_units": user.preferred_units,
        "height_cm": user.height_cm,
        "weight_kg": user.weight_kg,
        "weekly_workout_target": user.weekly_workout_target,
        "profile_complete": bool(user.fitness_goal and user.experience_level and user.weekly_workout_target),
        "created_at": utc(user.created_at),
        "updated_at": utc(user.profile_updated_at) if user.profile_updated_at else None,
    }


@app.patch("/api/me")
def update_me(payload: ProfileUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    for field, value in payload.model_dump().items():
        setattr(user, field, value)
    user.profile_updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(user)
    return serialize_profile(user)


@app.post("/api/workouts", status_code=201)
def create(payload: WorkoutCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    existing = db.get(Workout, str(payload.id))
    if existing:
        if existing.user_id != user.id:
            raise HTTPException(409, "Session identifier unavailable")
        if (
            existing.exercise != payload.exercise
            or existing.workout_id != str(payload.workout_id)
            or existing.source != payload.source
            or utc(existing.started_at) != payload.started_at
        ):
            raise HTTPException(409, "Session identifier already used")
        return serialize(existing)
    if payload.started_at > datetime.now(UTC) + timedelta(minutes=5):
        raise HTTPException(422, "Session cannot start in the future")
    workout = Workout(
        id=str(payload.id),
        workout_id=str(payload.workout_id),
        user_id=user.id,
        exercise=payload.exercise,
        source=payload.source,
        started_at=payload.started_at,
    )
    db.add(workout)
    db.commit()
    return serialize(workout)


@app.get("/api/workouts")
def history(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    rows = db.scalars(
        select(Workout)
        .where(Workout.user_id == user.id, Workout.source != "demo")
        .order_by(Workout.started_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [serialize(w, detail=False) for w in rows]


@app.get("/api/workouts/{session_id}")
def detail(session_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return serialize(owned(session_id, db, user))


@app.get("/api/workouts/{session_id}/metrics/summary", response_model=list[MetricSummary])
def metric_summary(session_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Return minute buckets; Tiger serves these from a real-time continuous aggregate."""
    workout = owned(session_id, db, user)
    aggregate = db.bind.dialect.name == "postgresql" and bool(
        db.scalar(text("SELECT to_regclass('movement_metrics_1m') IS NOT NULL"))
    )
    if aggregate:
        rows = db.execute(
            text(
                "SELECT bucket, metric_name, average, minimum, maximum, samples "
                "FROM movement_metrics_1m WHERE session_id=:session_id ORDER BY bucket, metric_name"
            ),
            {"session_id": workout.id},
        ).mappings()
        return [dict(row) for row in rows]

    # SQLite keeps local development feature-complete without pretending to
    # provide Tiger's incremental materialization.
    grouped: dict[tuple[datetime, str], list[float]] = {}
    for metric in workout.metrics:
        timestamp = utc(metric.recorded_at).replace(second=0, microsecond=0)
        grouped.setdefault((timestamp, metric.metric_name), []).append(metric.metric_value)
    return [
        {"bucket": bucket, "metric_name": name, "average": sum(values) / len(values),
         "minimum": min(values), "maximum": max(values), "samples": len(values)}
        for (bucket, name), values in sorted(grouped.items())
    ]


@app.post("/api/workouts/{session_id}/reps/batch")
def reps(
    session_id: UUID, payload: RepBatch, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    workout = owned(session_id, db, user)
    if workout.status != "active":
        raise HTTPException(409, "Session is already completed")
    existing = {r.rep_number: r for r in workout.reps}
    for rep in payload.reps:
        check_time(rep.completed_at, workout)
        data = rep.model_dump(mode="json")
        if rep.rep_number in existing:
            old = existing[rep.rep_number]
            if (
                utc(old.completed_at) != rep.completed_at
                or old.metrics_json != data["metrics_json"]
                or old.faults_json != data["faults_json"]
            ):
                raise HTTPException(409, "Rep number has conflicting data")
            continue
        row = RepEvent(
            session_id=workout.id, **rep.model_dump(exclude={"faults_json"}), faults_json=data["faults_json"]
        )
        db.add(row)
        existing[rep.rep_number] = row
    workout.total_reps = len(existing)
    db.commit()
    return {"total_reps": workout.total_reps}


@app.post("/api/workouts/{session_id}/metrics/batch")
def metrics(
    session_id: UUID, payload: MetricBatch, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    workout = owned(session_id, db, user)
    if workout.status != "active":
        raise HTTPException(409, "Session is already completed")
    count = db.scalar(
        select(func.count()).select_from(MovementMetric).where(MovementMetric.session_id == workout.id)
    )
    if count + len(payload.metrics) > 30000:
        raise HTTPException(422, "Session metric limit reached")
    for metric in payload.metrics:
        check_time(metric.recorded_at, workout)
        key = (metric.recorded_at, workout.id, metric.metric_name)
        existing = db.get(MovementMetric, key)
        if existing:
            if existing.metric_value != metric.metric_value:
                raise HTTPException(409, "Metric timestamp has conflicting data")
        else:
            db.add(MovementMetric(session_id=workout.id, **metric.model_dump()))
            db.flush()
    db.commit()
    return {"accepted": len(payload.metrics)}


@app.patch("/api/workouts/{session_id}")
def finish(
    session_id: UUID,
    payload: WorkoutFinish,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    workout = owned(session_id, db, user)
    if workout.status == "completed":
        return serialize(workout)
    check_time(payload.ended_at, workout)
    if any(utc(r.completed_at) > payload.ended_at for r in workout.reps) or any(
        utc(m.recorded_at) > payload.ended_at for m in workout.metrics
    ):
        raise HTTPException(422, "Session cannot end before its events")
    numbers = sorted(r.rep_number for r in workout.reps)
    if numbers != list(range(1, len(numbers) + 1)):
        raise HTTPException(422, "Rep sequence has gaps; upload missing reps before finishing")
    workout.ended_at = payload.ended_at
    workout.status = "completed"
    workout.total_reps = len(workout.reps)
    db.commit()
    return serialize(workout)


@app.post("/api/coaching/speech")
def coaching(payload: SpeechRequest, request: Request, subject: str | None = Depends(optional_subject)):
    remote = request.client.host if request.client else "unknown"
    rate_key = subject or f"guest:{remote}"
    services.rate_limit(rate_key, "speech-request", 60 if subject else 30)

    def provider_limit():
        services.rate_limit(rate_key, "speech-provider", 40 if subject else 20)
        if not subject:
            services.rate_limit("all-guests", "speech-provider", 40)

    return Response(
        services.speech(payload.text, before_provider=provider_limit),
        media_type="audio/mpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@app.post("/api/workouts/{session_id}/insights")
def insights(session_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    workout = owned(session_id, db, user)
    if workout.status != "completed":
        raise HTTPException(409, "Finish the session before requesting insights")
    if workout.insight_row:
        return workout.insight_row.summary_json
    services.rate_limit(user.id, "insights", 3)
    summary = services.generate_insight(workout)
    db.add(SessionInsight(session_id=workout.id, summary_json=summary))
    db.commit()
    return summary
