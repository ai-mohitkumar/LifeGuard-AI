"""Phase 1 integration tests: health check, user registration, login, and JWT auth."""


def test_health_endpoint_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert data["service"] == "LifeGuard AI"


def test_register_login_and_me_flow(client):
    # 1. Register a new user
    register_payload = {
        "full_name": "Priya Verma",
        "email": "Priya@Example.com",
        "password": "SecurePassword123",
    }
    reg_res = client.post("/api/auth/register", json=register_payload)
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert reg_data["token_type"] == "bearer"
    assert reg_data["access_token"]
    # Email should be normalized to lowercase
    assert reg_data["user"]["email"] == "priya@example.com"
    assert reg_data["user"]["full_name"] == "Priya Verma"
    assert "hashed_password" not in reg_data["user"]

    # 2. Duplicate registration should return 409 Conflict
    dup_res = client.post("/api/auth/register", json=register_payload)
    assert dup_res.status_code == 409

    # 3. Login with valid credentials
    login_res = client.post(
        "/api/auth/login",
        json={"email": "priya@example.com", "password": "SecurePassword123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # 4. Access protected /api/auth/me endpoint using JWT Bearer token
    me_res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "priya@example.com"


def test_login_invalid_password_returns_401(client):
    client.post(
        "/api/auth/register",
        json={
            "full_name": "Rohan Das",
            "email": "rohan@example.com",
            "password": "CorrectPassword123",
        },
    )

    bad_login = client.post(
        "/api/auth/login",
        json={"email": "rohan@example.com", "password": "WrongPassword"},
    )
    assert bad_login.status_code == 401


def test_me_without_token_returns_401(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_with_invalid_token_returns_401(client):
    res = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-real-jwt-token"},
    )
    assert res.status_code == 401


def test_register_rejects_whitespace_full_name(client):
    res = client.post(
        "/api/auth/register",
        json={
            "full_name": "   ",
            "email": "blankname@example.com",
            "password": "StrongPassword123",
        },
    )
    assert res.status_code == 422

