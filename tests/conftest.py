"""Pytest configuration providing an isolated test database and FastAPI TestClient."""

import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure the backend package is importable when running `pytest` from the project root.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Point DATABASE_URL to an isolated temporary SQLite file BEFORE importing app.main,
# so tests do not require a running PostgreSQL server.
_TEST_TMPDIR = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TEST_TMPDIR.name) / 'test_lifeguard.db'}"
os.environ["SECRET_KEY"] = "test-only-secret-key-at-least-32-bytes-long"

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def dispose_engine_on_exit():
    """Dispose SQLAlchemy engine at session end so Windows releases SQLite file locks."""
    yield
    engine.dispose()
    _TEST_TMPDIR.cleanup()


@pytest.fixture(autouse=True)
def reset_database():
    """Recreate all tables before each test so tests never share state."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def client() -> TestClient:
    """Return a FastAPI TestClient wired to the isolated test database."""
    with TestClient(app) as test_client:
        yield test_client
