from datetime import datetime, timezone, timedelta
from uuid import uuid4
import pytest


def create(client):
    start = datetime.now(timezone.utc) - timedelta(minutes=2)
    payload = {"id": str(uuid4()), "exercise": "squat", "source": "camera", "started_at": start.isoformat()}
    response = client.post("/api/workouts", json=payload)
    assert response.status_code == 201, response.text
    return payload


def rep(number=1):
    return {
        "rep_number": number,
        "completed_at": (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat(),
        "metrics_json": {"min_angle": 92, "duration_ms": 2500},
        "faults_json": [],
    }


def test_complete_workout_idempotency_and_persistence(client):
    workout = create(client)
    sid = workout["id"]
    assert client.post("/api/workouts", json=workout).status_code == 201
    data = {"reps": [rep()]}
    for _ in range(2):
        response = client.post(f"/api/workouts/{sid}/reps/batch", json=data)
        assert response.status_code == 200, response.text
        assert response.json()["total_reps"] == 1
    metric = {"recorded_at": data["reps"][0]["completed_at"], "metric_name": "knee_angle", "metric_value": 92}
    for _ in range(2):
        assert (
            client.post(f"/api/workouts/{sid}/metrics/batch", json={"metrics": [metric]}).status_code == 200
        )
    finish = client.patch(f"/api/workouts/{sid}", json={"ended_at": datetime.now(timezone.utc).isoformat()})
    assert finish.status_code == 200, finish.text
    assert finish.json()["total_reps"] == 1
    assert finish.json()["status"] == "completed"
    detail = client.get(f"/api/workouts/{sid}").json()
    assert len(detail["reps"]) == 1
    assert len(detail["metrics"]) == 1
    assert datetime.fromisoformat(detail["started_at"]).utcoffset() == timedelta(0)
    assert len(client.get("/api/workouts").json()) == 1
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [rep(2)]}).status_code == 409


def test_every_session_route_enforces_ownership(client, switch_user):
    workout = create(client)
    sid = workout["id"]
    switch_user("auth0|bob")
    assert client.get("/api/workouts").json() == []
    assert client.get(f"/api/workouts/{sid}").status_code == 404
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [rep()]}).status_code == 404
    assert client.post(f"/api/workouts/{sid}/metrics/batch", json={"metrics": []}).status_code == 404
    assert (
        client.patch(
            f"/api/workouts/{sid}", json={"ended_at": datetime.now(timezone.utc).isoformat()}
        ).status_code
        == 404
    )
    assert client.post(f"/api/workouts/{sid}/insights").status_code == 404
    assert client.post("/api/workouts", json=workout).status_code == 409


def test_both_arm_reps_and_angles_are_saved(client):
    workout = create(client)
    sid = workout["id"]
    reps = [rep(1), rep(2)]
    for side, item in enumerate(reps):
        item["metrics_json"]["arm_side"] = side
    response = client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": reps})
    assert response.status_code == 200, response.text
    assert response.json()["total_reps"] == 2
    metrics = [{"recorded_at": reps[0]["completed_at"], "metric_name": name, "metric_value": 90}
               for name in ["left_elbow_angle", "right_elbow_angle"]]
    assert client.post(f"/api/workouts/{sid}/metrics/batch", json={"metrics": metrics}).status_code == 200
    detail = client.get(f"/api/workouts/{sid}").json()
    assert {r["metrics_json"]["arm_side"] for r in detail["reps"]} == {0, 1}
    invalid = rep(3)
    invalid["metrics_json"]["arm_side"] = 0.5
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [invalid]}).status_code == 422


def test_metric_summary_buckets_and_tiger_status(client):
    workout = create(client)
    sid = workout["id"]
    start = datetime.fromisoformat(workout["started_at"]).replace(second=5, microsecond=0) + timedelta(minutes=1)
    metrics = [
        {"recorded_at": (start + timedelta(seconds=offset)).isoformat(),
         "metric_name": "elbow_angle", "metric_value": value}
        for offset, value in [(0, 80), (10, 100), (60, 120)]
    ]
    response = client.post(f"/api/workouts/{sid}/metrics/batch", json={"metrics": metrics})
    assert response.status_code == 200, response.text
    summary = client.get(f"/api/workouts/{sid}/metrics/summary")
    assert summary.status_code == 200, summary.text
    rows = summary.json()
    assert len(rows) == 2
    assert rows[0]["average"] == 90
    assert rows[0]["minimum"] == 80
    assert rows[0]["maximum"] == 100
    assert rows[0]["samples"] == 2
    assert client.get("/api/platform/tiger").json() == {
        "connected": False, "database": "sqlite", "timescale": False, "continuous_aggregate": False
    }


def test_conflicting_retries_and_rep_gaps_are_rejected(client):
    sid = create(client)["id"]
    data = rep(2)
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [data]}).status_code == 200
    data["metrics_json"]["min_angle"] = 100
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [data]}).status_code == 409
    assert (
        client.patch(
            f"/api/workouts/{sid}", json={"ended_at": datetime.now(timezone.utc).isoformat()}
        ).status_code
        == 422
    )


def test_limits_and_invalid_payloads(client):
    sid = create(client)["id"]
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [rep()] * 101}).status_code == 422
    invalid = {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "metric_name": "untrusted",
        "metric_value": 12,
    }
    assert client.post(f"/api/workouts/{sid}/metrics/batch", json={"metrics": [invalid]}).status_code == 422
    data = rep()
    data["completed_at"] = "2000-01-01T00:00:00Z"
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [data]}).status_code == 422
    data = rep()
    data["metrics_json"] = {"min_angle": 181}
    assert client.post(f"/api/workouts/{sid}/reps/batch", json={"reps": [data]}).status_code == 422
    assert (
        client.post(
            "/api/workouts", content=b"x" * 513000, headers={"content-type": "application/json"}
        ).status_code
        == 413
    )


@pytest.mark.parametrize("field,value", [("user_id", "someone-else"), ("total_reps", 999)])
def test_client_cannot_override_owner_or_totals(client, field, value):
    payload = create(client)
    payload["id"] = str(uuid4())
    payload[field] = value
    assert client.post("/api/workouts", json=payload).status_code == 422
