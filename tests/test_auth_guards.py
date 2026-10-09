import subprocess
import sys


def test_auth_disabled_in_production_raises_error():
    """Verify system halts on startup if AUTH_ENABLED is False in a production environment."""
    code = """
import os
os.environ['ENVIRONMENT'] = 'production'
os.environ['AUTH_ENABLED'] = 'false'
from api import security
"""
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode != 0
    assert "AUTH_ENABLED=False is not allowed in production" in result.stderr


def test_demo_mode_requires_password():
    """Verify demo mode startup guard validates that DEMO_ADMIN_PASSWORD is set."""
    code = """
import os
os.environ['ENVIRONMENT'] = 'development'
os.environ['DEMO_MODE'] = 'true'
if 'DEMO_ADMIN_PASSWORD' in os.environ:
    del os.environ['DEMO_ADMIN_PASSWORD']
from fastapi.testclient import TestClient
from main import app
with TestClient(app):
    pass
"""
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode != 0
    assert "DEMO_MODE=true requires DEMO_ADMIN_PASSWORD" in result.stderr


def test_demo_mode_forbidden_in_production():
    """Verify demo mode is strictly forbidden in a production environment."""
    code = """
import os
os.environ['ENVIRONMENT'] = 'production'
os.environ['DEMO_MODE'] = 'true'
os.environ['AUTH_ENABLED'] = 'true'
os.environ['SECRET_KEY'] = 'production-secret-key-that-is-at-least-32-chars-long'
from fastapi.testclient import TestClient
from main import app
with TestClient(app):
    pass
"""
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode != 0
    assert "DEMO_MODE=true is not allowed in production" in result.stderr
