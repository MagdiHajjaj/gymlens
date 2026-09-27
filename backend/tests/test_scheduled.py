def test_schedule_and_list(client):
    created = client.post(
        "/api/scheduled",
        json={"scheduled_date": "2026-09-30", "name": "Leg day", "exercises": ["squat", "lunge"]},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["scheduled_date"] == "2026-09-30"
    assert body["name"] == "Leg day"
    assert body["exercises"] == ["squat", "lunge"]

    listed = client.get("/api/scheduled").json()
    assert [item["id"] for item in listed] == [body["id"]]


def test_schedule_dedupes_exercises(client):
    created = client.post(
        "/api/scheduled",
        json={"scheduled_date": "2026-09-30", "exercises": ["squat", "squat", "press"]},
    )
    assert created.status_code == 201
    assert created.json()["exercises"] == ["squat", "press"]


def test_schedule_validation(client):
    assert (
        client.post("/api/scheduled", json={"scheduled_date": "2026-09-30", "exercises": []}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/scheduled", json={"scheduled_date": "2026-09-30", "exercises": ["handstand"]}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/scheduled", json={"scheduled_date": "not-a-date", "exercises": ["squat"]}
        ).status_code
        == 422
    )


def test_scheduled_scoped_to_user(client, switch_user):
    created = client.post(
        "/api/scheduled", json={"scheduled_date": "2026-09-30", "exercises": ["squat"]}
    ).json()
    switch_user("auth0|bob")
    assert client.get("/api/scheduled").json() == []
    assert client.delete(f"/api/scheduled/{created['id']}").status_code == 404


def test_delete_scheduled(client):
    created = client.post(
        "/api/scheduled", json={"scheduled_date": "2026-09-30", "exercises": ["squat"]}
    ).json()
    assert client.delete(f"/api/scheduled/{created['id']}").status_code == 204
    assert client.get("/api/scheduled").json() == []
    assert client.delete(f"/api/scheduled/{created['id']}").status_code == 404
