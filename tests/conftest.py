"""
conftest.py — Shared pytest configuration.

DB Schema Lifecycle:
    main.py calls `_run_migrations()` at module import time (line 31).
    This runs `alembic upgrade head` immediately when `main` is first
    imported — before any test runs. Tables therefore exist for all tests.

    The lifespan event (seed_database) fires when a TestClient context
    is entered. test_api.py creates `client = TestClient(app)` at module
    level, which triggers startup during pytest collection.

    No conftest session fixture is needed: alembic runs at import time,
    seeding runs when the first TestClient is created.

Auth Test Isolation:
    Auth tests are marked @pytest.mark.auth and excluded from the default
    run (see pytest.ini addopts). To run them separately:

        Windows: $env:AUTH_ENABLED="True"; $env:DEMO_MODE="true"; pytest -m auth -v
        Linux:   AUTH_ENABLED=True DEMO_MODE=true pytest -m auth -v
"""


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "auth: tests that require AUTH_ENABLED=True and DEMO_MODE=true"
    )
