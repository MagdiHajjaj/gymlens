import time
from types import SimpleNamespace
from uuid import uuid4
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from app.main import app
from app.core.security import current_subject
from app.core import security
from app.core.config import settings


def test_all_api_routes_require_authentication(client):
    del app.dependency_overrides[current_subject]
    sid = str(uuid4())
    endpoints = [
        ("GET", "/api/me"),
        ("PATCH", "/api/me"),
        ("GET", "/api/workouts"),
        ("POST", "/api/workouts"),
        ("GET", f"/api/workouts/{sid}"),
        ("GET", f"/api/workouts/{sid}/metrics/summary"),
        ("GET", "/api/platform/tiger"),
        ("PATCH", f"/api/workouts/{sid}"),
        ("POST", f"/api/workouts/{sid}/reps/batch"),
        ("POST", f"/api/workouts/{sid}/metrics/batch"),
        ("POST", f"/api/workouts/{sid}/insights"),
        ("POST", "/api/coaching/speech"),
    ]
    for method, path in endpoints:
        assert client.request(method, path, json={}).status_code == 401
    assert client.get("/health").status_code == 200
    assert client.get("/health/ready").status_code == 200


@pytest.fixture
def signing(client, monkeypatch):
    del app.dependency_overrides[current_subject]
    monkeypatch.setattr(settings, "auth0_domain", "example.auth0.com")
    monkeypatch.setattr(settings, "auth0_audience", "https://gym-lens-api")
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(
        security,
        "jwks_client",
        lambda _: SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(key=private.public_key())
        ),
    )
    claims = {
        "sub": "auth0|real-signed-user",
        "aud": settings.auth0_audience,
        "iss": f"https://{settings.auth0_domain}/",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
    }
    return private, claims


def test_valid_rs256_token_provisions_user(client, signing):
    private, claims = signing
    token = jwt.encode(claims, private, algorithm="RS256", headers={"kid": "test-key"})
    first = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert first.status_code == 200, first.text
    second = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert first.json()["id"] == second.json()["id"]


def test_profile_is_private_and_persists_training_preferences(client, switch_user):
    payload = {
        "display_name": "Alice Athlete",
        "fitness_goal": "strength",
        "experience_level": "intermediate",
        "preferred_units": "metric",
        "height_cm": 168.5,
        "weight_kg": 67.2,
        "weekly_workout_target": 4,
    }
    response = client.patch("/api/me", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["profile_complete"] is True
    assert response.json()["fitness_goal"] == "strength"

    assert client.get("/api/me").json()["display_name"] == "Alice Athlete"
    switch_user("auth0|bob")
    other = client.get("/api/me").json()
    assert other["display_name"] == "Gym Lens member"
    assert other["fitness_goal"] is None


def test_profile_rejects_out_of_range_measurements(client):
    response = client.patch(
        "/api/me",
        json={
            "display_name": "Alice",
            "fitness_goal": "mobility",
            "experience_level": "beginner",
            "preferred_units": "metric",
            "height_cm": 20,
            "weight_kg": None,
            "weekly_workout_target": 3,
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "changed", [{"exp": 1}, {"aud": "wrong"}, {"iss": "https://evil.test/"}, {"sub": ""}, {"exp": None}]
)
def test_invalid_claims_are_rejected(client, signing, changed):
    private, claims = signing
    claims.update(changed)
    if claims["exp"] is None:
        claims.pop("exp")
    token = jwt.encode(claims, private, algorithm="RS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_forged_signature_is_rejected(client, signing):
    _, claims = signing
    forged_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(claims, forged_key, algorithm="RS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
