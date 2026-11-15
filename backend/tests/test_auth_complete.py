"""Comprehensive test suite for LifeGuard AI authentication system:
- Google Identity Services OAuth
- GitHub OAuth with CSRF state protection & verified email resolution
- Email/Password registration & login with password confirmation
- Dual-mode session security (HttpOnly cookies + Bearer tokens)
- OAuthAccount mapping & conflict prevention
"""

from unittest.mock import patch
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models.user import OAuthAccount, User
from app.routers import auth


@pytest.fixture
def test_setup():
    """Create an isolated SQLite in-memory database with StaticPool and TestClient."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    app = FastAPI()
    app.include_router(auth.router)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    yield client, TestingSessionLocal

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


# ===========================================================================
# EMAIL / PASSWORD AUTHENTICATION TESTS
# ===========================================================================

def test_register_success(test_setup):
    client, session_factory = test_setup
    payload = {
        "full_name": "Test User",
        "email": "test@enterprise.com",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@enterprise.com"
    assert data["user"]["full_name"] == "Test User"

    # Verify HttpOnly cookie was set
    assert "access_token" in response.cookies
    assert response.cookies["access_token"] == data["access_token"]

    # Verify user exists in database with hashed password
    with session_factory() as db:
        user = db.query(User).filter(User.email == "test@enterprise.com").first()
        assert user is not None
        assert user.hashed_password != "Password123!"
        assert user.is_active is True


def test_register_password_mismatch(test_setup):
    client, _ = test_setup
    payload = {
        "full_name": "Mismatch User",
        "email": "mismatch@enterprise.com",
        "password": "Password123!",
        "confirm_password": "DifferentPassword123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422
    assert "Password confirmation does not match" in response.text


def test_register_password_too_short(test_setup):
    client, _ = test_setup
    payload = {
        "full_name": "Short Password User",
        "email": "short@enterprise.com",
        "password": "123",
        "confirm_password": "123",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_register_duplicate_email(test_setup):
    client, session_factory = test_setup
    with session_factory() as db:
        user = User(
            full_name="Original User",
            email="duplicate@enterprise.com",
            hashed_password=hash_password("Password123!"),
        )
        db.add(user)
        db.commit()

    payload = {
        "full_name": "Duplicate User",
        "email": "duplicate@enterprise.com",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_login_success(test_setup):
    client, session_factory = test_setup
    with session_factory() as db:
        user = User(
            full_name="Login User",
            email="login@enterprise.com",
            hashed_password=hash_password("ValidPassword123!"),
        )
        db.add(user)
        db.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": "login@enterprise.com", "password": "ValidPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "login@enterprise.com"
    assert "access_token" in response.cookies


def test_login_invalid_password(test_setup):
    client, session_factory = test_setup
    with session_factory() as db:
        user = User(
            full_name="Login User",
            email="wrongpass@enterprise.com",
            hashed_password=hash_password("CorrectPassword123!"),
        )
        db.add(user)
        db.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": "wrongpass@enterprise.com", "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


def test_login_nonexistent_user(test_setup):
    client, _ = test_setup
    response = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@enterprise.com", "password": "SomePassword!"},
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


def test_login_inactive_user(test_setup):
    client, session_factory = test_setup
    with session_factory() as db:
        user = User(
            full_name="Inactive User",
            email="inactive@enterprise.com",
            hashed_password=hash_password("Password123!"),
            is_active=False,
        )
        db.add(user)
        db.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": "inactive@enterprise.com", "password": "Password123!"},
    )
    assert response.status_code == 403
    assert "inactive" in response.json()["detail"]


def test_logout(test_setup):
    client, _ = test_setup
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out successfully"


# ===========================================================================
# DUAL-MODE SESSION & /api/auth/me TESTS
# ===========================================================================

def test_me_with_bearer_token(test_setup):
    client, session_factory = test_setup
    with session_factory() as db:
        user = User(
            full_name="Me Bearer",
            email="mebearer@enterprise.com",
            hashed_password=hash_password("Password123!"),
        )
        db.add(user)
        db.commit()

    login_resp = client.post(
        "/api/auth/login",
        json={"email": "mebearer@enterprise.com", "password": "Password123!"},
    )
    token = login_resp.json()["access_token"]

    # Call /me without cookies, using Authorization header only
    client.cookies.clear()
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "mebearer@enterprise.com"


def test_me_with_httponly_cookie(test_setup):
    client, session_factory = test_setup
    with session_factory() as db:
        user = User(
            full_name="Me Cookie",
            email="mecookie@enterprise.com",
            hashed_password=hash_password("Password123!"),
        )
        db.add(user)
        db.commit()

    # Login automatically populates client cookies
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "mecookie@enterprise.com", "password": "Password123!"},
    )
    assert login_resp.status_code == 200

    # Call /me without Authorization header; cookie must authenticate
    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "mecookie@enterprise.com"


def test_me_unauthenticated(test_setup):
    client, _ = test_setup
    client.cookies.clear()
    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 401


# ===========================================================================
# GOOGLE OAUTH TESTS
# ===========================================================================

@patch("app.routers.auth.verify_google_id_token")
def test_google_oauth_provision_and_mapping(mock_verify, test_setup):
    client, session_factory = test_setup
    mock_verify.return_value = {
        "iss": "https://accounts.google.com",
        "sub": "google-uid-001",
        "email": "google.user@gmail.com",
        "email_verified": True,
        "name": "Google User",
    }

    resp = client.post("/api/auth/google", json={"id_token": "valid.google.id.token"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == "google.user@gmail.com"
    assert "access_token" in data
    assert "access_token" in resp.cookies

    # Verify user and OAuthAccount record
    with session_factory() as db:
        user = db.query(User).filter(User.email == "google.user@gmail.com").first()
        assert user is not None
        assert len(user.oauth_accounts) == 1
        assert user.oauth_accounts[0].provider == "google"
        assert user.oauth_accounts[0].provider_user_id == "google-uid-001"


@patch("app.routers.auth.verify_google_id_token")
def test_google_oauth_link_existing_user(mock_verify, test_setup):
    client, session_factory = test_setup
    with session_factory() as db:
        existing = User(
            full_name="Existing Google Target",
            email="target@gmail.com",
            hashed_password=hash_password("Pass123!"),
        )
        db.add(existing)
        db.commit()
        target_id = existing.id

    mock_verify.return_value = {
        "iss": "accounts.google.com",
        "sub": "google-uid-target",
        "email": "target@gmail.com",
        "email_verified": True,
        "name": "Target User",
    }

    resp = client.post("/api/auth/google", json={"id_token": "valid.token"})
    assert resp.status_code == 200
    assert resp.json()["user"]["id"] == target_id

    # Verify OAuthAccount created for existing user
    with session_factory() as db:
        oauth = db.query(OAuthAccount).filter(OAuthAccount.provider_user_id == "google-uid-target").first()
        assert oauth is not None
        assert oauth.user_id == target_id


@patch("app.routers.auth.verify_google_id_token")
def test_google_oauth_prevent_duplicate_identity_conflict(mock_verify, test_setup):
    """If a google sub is already registered to User A, but a token comes in with User B's email, reject with 409."""
    client, session_factory = test_setup
    with session_factory() as db:
        user_a = User(
            full_name="User A",
            email="usera@gmail.com",
            hashed_password=hash_password("PassA123!"),
        )
        db.add(user_a)
        db.commit()

        # Link google-uid-conflict to user_a
        db.add(OAuthAccount(user_id=user_a.id, provider="google", provider_user_id="google-uid-conflict"))
        db.commit()

        # User B registers separately
        user_b = User(
            full_name="User B",
            email="userb@gmail.com",
            hashed_password=hash_password("PassB123!"),
        )
        db.add(user_b)
        db.commit()

    # Google token claims email userb@gmail.com, but sub is google-uid-conflict (belonging to User A)
    mock_verify.return_value = {
        "iss": "accounts.google.com",
        "sub": "google-uid-conflict",
        "email": "userb@gmail.com",
        "email_verified": True,
    }

    resp = client.post("/api/auth/google", json={"id_token": "valid.token.longer.than.10.chars"})
    assert resp.status_code == 409
    assert "already linked to a different user" in resp.json()["detail"]


# ===========================================================================
# GITHUB OAUTH TESTS
# ===========================================================================

def test_github_login_redirect(test_setup):
    client, _ = test_setup
    with patch("app.routers.auth.settings.GITHUB_CLIENT_ID", "dummy-gh-client-id"):
        resp = client.get("/api/auth/github/login", follow_redirects=False)
        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "github.com/login/oauth/authorize" in location
        assert "client_id=dummy-gh-client-id" in location
        assert "state=" in location
        assert "github_oauth_state" in resp.cookies


@patch("app.routers.auth.fetch_github_user")
@patch("app.routers.auth.exchange_code_for_token")
def test_github_callback_success(mock_exchange, mock_fetch, test_setup):
    client, session_factory = test_setup
    mock_exchange.return_value = "gh-mock-access-token"
    mock_fetch.return_value = {
        "provider_user_id": "12345678",
        "email": "developer@github.com",
        "name": "Octocat Developer",
        "username": "octocat",
    }

    # Simulate state cookie from /github/login
    client.cookies.set("github_oauth_state", "secure_random_state_xyz")

    resp = client.get(
        "/api/auth/github/callback?code=mock_code_123&state=secure_random_state_xyz",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert "auth_token=" in location
    assert "access_token" in resp.cookies

    # Verify user and OAuthAccount
    with session_factory() as db:
        user = db.query(User).filter(User.email == "developer@github.com").first()
        assert user is not None
        assert user.full_name == "Octocat Developer"
        assert len(user.oauth_accounts) == 1
        assert user.oauth_accounts[0].provider == "github"
        assert user.oauth_accounts[0].provider_user_id == "12345678"


def test_github_callback_invalid_state_csrf(test_setup):
    client, _ = test_setup
    client.cookies.set("github_oauth_state", "state_aaa")

    resp = client.get(
        "/api/auth/github/callback?code=mock_code&state=different_state_bbb",
        follow_redirects=False,
    )
    assert resp.status_code == 400
    assert "Invalid or expired OAuth state" in resp.json()["detail"]


def test_github_callback_missing_params(test_setup):
    client, _ = test_setup
    resp = client.get("/api/auth/github/callback", follow_redirects=False)
    assert resp.status_code == 400
    assert "Missing OAuth code or state" in resp.json()["detail"]


@patch("app.routers.auth.exchange_code_for_token")
def test_github_callback_token_exchange_error(mock_exchange, test_setup):
    client, _ = test_setup
    mock_exchange.side_effect = ValueError("GitHub token exchange returned error bad_verification_code")
    client.cookies.set("github_oauth_state", "state_valid")

    resp = client.get(
        "/api/auth/github/callback?code=bad_code&state=state_valid",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "auth_error=" in resp.headers["location"]
    assert "bad_verification_code" in resp.headers["location"]


@patch("app.routers.auth.fetch_github_user")
@patch("app.routers.auth.exchange_code_for_token")
def test_github_callback_unverified_email_error(mock_exchange, mock_fetch, test_setup):
    client, _ = test_setup
    mock_exchange.return_value = "gh-token"
    mock_fetch.side_effect = ValueError("GitHub account has no verified email address.")
    client.cookies.set("github_oauth_state", "state_valid")

    resp = client.get(
        "/api/auth/github/callback?code=good_code&state=state_valid",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "auth_error=" in resp.headers["location"]
    loc_lower = resp.headers["location"].lower()
    assert "verified" in loc_lower and "email" in loc_lower
