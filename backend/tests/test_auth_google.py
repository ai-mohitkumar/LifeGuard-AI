"""Tests for Google Identity Services server-side OAuth authentication."""

from unittest.mock import patch
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.google_auth import GOOGLE_ISSUERS, verify_google_id_token
from app.core.security import hash_password
from app.database import Base
from app.models.user import User
from app.routers.auth import google_auth
from app.schemas.auth import GoogleAuthRequest


@pytest.fixture
def db_session():
    """Create an isolated in-memory SQLite database session for each test."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# Unit tests for core verify_google_id_token helper
# ---------------------------------------------------------------------------

def test_verify_google_id_token_empty():
    with pytest.raises(ValueError, match="cannot be empty"):
        verify_google_id_token("")

    with pytest.raises(ValueError, match="cannot be empty"):
        verify_google_id_token("   ")


@patch("app.core.google_auth.id_token.verify_oauth2_token")
def test_verify_google_id_token_untrusted_issuer(mock_verify):
    mock_verify.return_value = {
        "iss": "untrusted.issuer.com",
        "email": "user@example.com",
        "email_verified": True,
    }
    with pytest.raises(ValueError, match="Invalid Google token issuer"):
        verify_google_id_token("dummy.token.here")


@patch("app.core.google_auth.id_token.verify_oauth2_token")
def test_verify_google_id_token_unverified_email(mock_verify):
    mock_verify.return_value = {
        "iss": GOOGLE_ISSUERS[0],
        "email": "unverified@example.com",
        "email_verified": False,
    }
    with pytest.raises(ValueError, match="email is not verified"):
        verify_google_id_token("dummy.token.here")


@patch("app.core.google_auth.id_token.verify_oauth2_token")
def test_verify_google_id_token_missing_email(mock_verify):
    mock_verify.return_value = {
        "iss": GOOGLE_ISSUERS[0],
        "email_verified": True,
    }
    with pytest.raises(ValueError, match="missing an email address"):
        verify_google_id_token("dummy.token.here")


@patch("app.core.google_auth.id_token.verify_oauth2_token")
def test_verify_google_id_token_valid(mock_verify):
    expected_payload = {
        "iss": GOOGLE_ISSUERS[0],
        "email": "doctor.verified@gmail.com",
        "email_verified": True,
        "name": "Dr. Sarah",
        "sub": "google-sub-12345",
    }
    mock_verify.return_value = expected_payload
    result = verify_google_id_token("valid.google.token")
    assert result["email"] == "doctor.verified@gmail.com"
    assert result["email_verified"] is True
    assert result["name"] == "Dr. Sarah"


# ---------------------------------------------------------------------------
# Unit & Integration tests for google_auth endpoint handler
# ---------------------------------------------------------------------------

@patch("app.routers.auth.verify_google_id_token")
def test_google_login_new_user_provisioning(mock_verify, db_session):
    """Test that a new Google user is automatically provisioned and issued a valid JWT."""
    mock_verify.return_value = {
        "iss": "https://accounts.google.com",
        "sub": "g-sub-999",
        "email": "alex.morgan@gmail.com",
        "email_verified": True,
        "name": "Alex Morgan",
    }

    req = GoogleAuthRequest(id_token="valid.google.token.new.user")
    response = google_auth(req, db_session)

    assert response.access_token is not None
    assert len(response.access_token) > 20
    assert response.token_type == "bearer"
    assert response.user.email == "alex.morgan@gmail.com"
    assert response.user.full_name == "Alex Morgan"
    assert response.user.is_active is True

    # Verify user was saved in DB
    user_in_db = db_session.query(User).filter(User.email == "alex.morgan@gmail.com").first()
    assert user_in_db is not None
    assert user_in_db.full_name == "Alex Morgan"


@patch("app.routers.auth.verify_google_id_token")
def test_google_login_existing_user(mock_verify, db_session):
    """Test that an existing user is looked up and authenticated without duplicating accounts."""
    existing_user = User(
        full_name="Existing Doctor",
        email="doctor.jones@gmail.com",
        hashed_password=hash_password("RandomPassword123!"),
        is_active=True,
    )
    db_session.add(existing_user)
    db_session.commit()
    db_session.refresh(existing_user)
    orig_id = existing_user.id

    mock_verify.return_value = {
        "iss": "accounts.google.com",
        "sub": "g-sub-existing",
        "email": "doctor.jones@gmail.com",
        "email_verified": True,
        "name": "Doctor Jones",
    }

    req = GoogleAuthRequest(id_token="valid.google.token.existing.user")
    response = google_auth(req, db_session)

    assert response.user.id == orig_id
    assert response.user.email == "doctor.jones@gmail.com"

    # Confirm only one user exists in the database
    count = db_session.query(User).filter(User.email == "doctor.jones@gmail.com").count()
    assert count == 1


@patch("app.routers.auth.verify_google_id_token")
def test_google_login_invalid_token(mock_verify, db_session):
    """Test that an invalid token signature raises HTTP 401 Unauthorized."""
    mock_verify.side_effect = ValueError("Token signature verification failed.")

    req = GoogleAuthRequest(id_token="tampered.or.invalid.token")
    with pytest.raises(HTTPException) as exc_info:
        google_auth(req, db_session)

    assert exc_info.value.status_code == 401
    assert "Google authentication failed" in exc_info.value.detail


@patch("app.routers.auth.verify_google_id_token")
def test_google_login_unverified_email(mock_verify, db_session):
    """Test that an unverified Google account email raises HTTP 401."""
    mock_verify.side_effect = ValueError("Google account email is not verified.")

    req = GoogleAuthRequest(id_token="unverified.email.token")
    with pytest.raises(HTTPException) as exc_info:
        google_auth(req, db_session)

    assert exc_info.value.status_code == 401
    assert "email is not verified" in exc_info.value.detail


def test_google_login_missing_or_short_token():
    """Test that empty or malformed token fails Pydantic schema validation."""
    with pytest.raises(ValidationError):
        GoogleAuthRequest()

    with pytest.raises(ValidationError):
        GoogleAuthRequest(id_token="short")


@patch("app.routers.auth.verify_google_id_token")
def test_google_login_inactive_user(mock_verify, db_session):
    """Test that an inactive account cannot sign in even with valid Google token."""
    banned_user = User(
        full_name="Banned User",
        email="banned@gmail.com",
        hashed_password=hash_password("SomePassword123!"),
        is_active=False,
    )
    db_session.add(banned_user)
    db_session.commit()

    mock_verify.return_value = {
        "iss": "accounts.google.com",
        "sub": "g-sub-banned",
        "email": "banned@gmail.com",
        "email_verified": True,
    }

    req = GoogleAuthRequest(id_token="valid.token.for.banned.user")
    with pytest.raises(HTTPException) as exc_info:
        google_auth(req, db_session)

    assert exc_info.value.status_code == 403
    assert "account is inactive" in exc_info.value.detail
