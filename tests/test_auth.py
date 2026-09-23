"""Auth tests.

IMPORTANT: AUTH_ENABLED=True and DEMO_MODE=true must be set before `main` is
imported so that the module-level security.py checks and the lifespan admin
seeding both run correctly. This module sets both env vars at module load time.
"""
import os

import pytest
from fastapi.testclient import TestClient

import models
from main import app


@pytest.fixture(scope="module", autouse=True)
def setup_auth_env():
    """Ensure auth env vars are active and admin user exists for this module.
    _run_migrations() at import time created the schema.
    Admin user is seeded directly (no nested TestClient to avoid lifespan recursion).
    """
    os.environ["AUTH_ENABLED"] = "True"
    os.environ["SECRET_KEY"] = "test-secret-key-minimum-32-chars-for-auth-tests"
    os.environ["DEMO_MODE"] = "true"

    # Seed admin user directly (idempotent)
    from api.security import get_password_hash
    from database import SessionLocal
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.username == "admin").first()
        if not admin:
            admin = models.User(
                username="admin",
                hashed_password=get_password_hash("admin"),
                role="ADMIN",
                is_active=True
            )
            db.add(admin)
            db.commit()
            print("[TEST] Seeded admin user for auth tests.")
    finally:
        db.close()

    yield

    # Restore (do NOT drop schema)
    os.environ.pop("AUTH_ENABLED", None)
    os.environ.pop("DEMO_MODE", None)


client = TestClient(app)


@pytest.mark.auth
def test_login_success(setup_auth_env):
    response = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"

@pytest.mark.auth
def test_login_failure(setup_auth_env):
    response = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "wrongpassword"}
    )
    assert response.status_code == 401

@pytest.mark.auth
def test_get_me_success(setup_auth_env):
    # Login first
    response = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "admin"}
    )
    assert response.status_code == 200, f"Login failed: {response.json()}"
    token = response.json()["access_token"]

    # Fetch /me
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "ADMIN"
    assert data["is_active"] == True

@pytest.mark.auth
def test_get_me_unauthorized(setup_auth_env):
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer fake_token"}
    )
    assert response.status_code == 401
