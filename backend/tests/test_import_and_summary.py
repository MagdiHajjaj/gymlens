from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app import services


def seed_completed(client, days_ago, exercise="squat", reps=10, source="import"):
    start = datetime.now(timezone.utc) - timedelta(days=days_ago, minutes=30)
    sid = str(uuid4())
    payload = {
        "id": sid,
        "workout_id": sid,
        "workout_name": "Imported",
        "exercise": exercise,
        "source": source,
        "started_at": start.isoformat(),
    }
    assert client.post("/api/workouts", json=payload).status_code == 201, payload
    rep_list = [
        {
            "rep_number": i + 1,
            "completed_at": (start + timedelta(seconds=30 * (i + 1))).isoformat(),
            "metrics_json": {},
            "faults_json": [],
        }
        for i in range(reps)
    ]
    for i in range(0, len(rep_list), 100):
        response = client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": rep_list[i : i + 100]})
        assert response.status_code == 200, response.text
    end = start + timedelta(minutes=30)
    finish = client.patch(f"/api/workouts/{sid}", json={"ended_at": end.isoformat()})
    assert finish.status_code == 200, finish.text
    assert finish.json()["status"] == "completed"
    assert finish.json()["total_reps"] == reps
    return sid


def test_import_source_accepted_and_visible_in_history(client):
    sid = seed_completed(client, days_ago=5, exercise="deadlift", reps=24)
    history = client.get("/api/workouts").json()
    assert [w["id"] for w in history] == [sid]
    assert history[0]["source"] == "import"
    assert history[0]["total_reps"] == 24


def test_history_summary_needs_history(client):
    response = client.post("/api/history/summary")
    assert response.status_code == 404


def test_history_summary_returns_ai_coaching(client, monkeypatch):
    seed_completed(client, days_ago=1, exercise="squat", reps=30)
    seed_completed(client, days_ago=2, exercise="squat", reps=25)
    seed_completed(client, days_ago=4, exercise="pushup", reps=20)
    canned = {
        "recap": "Three sessions in four days.",
        "highlights": ["Trained 3 of the last 4 days"],
        "trends": ["Squat volume leads pushup volume"],
        "next_focus": "Add a pulling movement",
        "source": "gemini",
    }
    monkeypatch.setattr(services, "generate_history_summary", lambda stats: canned)
    response = client.post("/api/history/summary")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["recap"] == canned["recap"]
    assert body["next_focus"] == canned["next_focus"]


def test_history_summary_is_rate_limited(client):
    seed_completed(client, days_ago=1)
    # No Gemini key in tests: first calls fail at generation (503), the 4th hits the rate limit.
    statuses = [client.post("/api/history/summary").status_code for _ in range(4)]
    assert statuses[:3] == [503, 503, 503]
    assert statuses[3] == 429


def test_history_stats_counts_streaks_and_weeks(client):
    from app.core.database import get_db
    from app.main import app

    seed_completed(client, days_ago=0, exercise="squat", reps=10)
    seed_completed(client, days_ago=1, exercise="squat", reps=10)
    seed_completed(client, days_ago=2, exercise="row", reps=10)

    gen = app.dependency_overrides[get_db]()
    db = next(gen)
    try:
        from app.models import User
        from sqlalchemy import select

        user_id = db.scalar(select(User.id).where(User.auth0_sub == "auth0|alice"))
        stats = services.history_stats(db, user_id)
    finally:
        gen.close()
    assert stats["total_sessions"] == 3
    assert stats["current_streak_days"] == 3
    assert stats["per_exercise"]["squat"]["sessions"] == 2
    assert stats["per_exercise"]["squat"]["reps"] == 20
    assert stats["favorite_exercise"] == "squat"
    assert stats["imported_sessions"] == 3
    assert sum(stats["sessions_per_week_last_8_weeks"]) == 3
