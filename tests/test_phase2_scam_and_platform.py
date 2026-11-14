"""Phase 2 tests: Scam Shield lexical features, SMS/URL endpoints, history, feedback, and registry."""

from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.scam.features import URL_FEATURE_NAMES, URLLexicalFeatureExtractor  # noqa: E402


def _register_and_get_headers(client, email: str, full_name: str = "Test User") -> dict[str, str]:
    res = client.post(
        "/api/auth/register",
        json={
            "full_name": full_name,
            "email": email,
            "password": "StrongPassword123",
        },
    )
    assert res.status_code == 201
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_url_lexical_feature_extractor():
    extractor = URLLexicalFeatureExtractor()
    urls = [
        "https://www.wikipedia.org",
        "http://user@login.secure.example.com/verify123?id=9",
    ]
    mat = extractor.transform(urls)
    assert mat.shape == (2, len(URL_FEATURE_NAMES))

    idx = {name: i for i, name in enumerate(URL_FEATURE_NAMES)}
    # Safe HTTPS URL with www.wikipedia.org (1 subdomain 'www', 0 '@', 0 digits)
    assert mat[0, idx["is_https"]] == 1.0
    assert mat[0, idx["has_at_symbol"]] == 0.0
    assert mat[0, idx["num_dots"]] == 2.0
    assert mat[0, idx["subdomain_count"]] == 1.0

    # Suspicious HTTP URL with '@', digits, and 2 subdomains (login, secure)
    assert mat[1, idx["is_https"]] == 0.0
    assert mat[1, idx["has_at_symbol"]] == 1.0
    assert mat[1, idx["subdomain_count"]] == 2.0
    assert mat[1, idx["digits_ratio"]] > 0.0


def test_scam_endpoints_require_authentication(client):
    assert client.post("/api/scam/predict-sms", json={"text": "hello"}).status_code == 401
    assert client.post("/api/scam/predict-url", json={"url": "https://example.com"}).status_code == 401
    assert client.get("/api/history").status_code == 401
    assert client.get("/api/models").status_code == 401


def test_sms_url_prediction_history_feedback_and_registry(client):
    headers_user1 = _register_and_get_headers(client, "user1@example.com", "User One")
    headers_user2 = _register_and_get_headers(client, "user2@example.com", "User Two")

    # 1. SMS Scam prediction + explanation
    sms_res = client.post(
        "/api/scam/predict-sms",
        headers=headers_user1,
        json={"text": "URGENT! Claim your FREE cash prize now. Call 09061701461!"},
    )
    assert sms_res.status_code == 200
    sms_data = sms_res.json()
    assert sms_data["sub_model"] == "sms"
    assert sms_data["label"] in ("suspicious", "scam")
    assert 0.0 <= sms_data["scam_probability"] <= 1.0
    assert len(sms_data["top_contributors"]) > 0
    pred_id = sms_data["prediction_id"]

    # 2. URL Phishing prediction + SHAP explanation
    url_res = client.post(
        "/api/scam/predict-url",
        headers=headers_user1,
        json={"url": "http://192.168.1.45/login.secure.verify-account.com/update?id=123"},
    )
    assert url_res.status_code == 200
    url_data = url_res.json()
    assert url_data["sub_model"] == "url"
    assert url_data["label"] in ("suspicious", "scam")
    assert len(url_data["top_contributors"]) > 0
    assert url_data["extracted_features"]["is_https"] == 0.0
    assert url_data["extracted_features"]["has_ip_address"] == 1.0

    # 3. Per-user prediction history isolation
    hist1 = client.get("/api/history?module=scam", headers=headers_user1)
    assert hist1.status_code == 200
    assert len(hist1.json()) == 2

    hist2 = client.get("/api/history", headers=headers_user2)
    assert hist2.status_code == 200
    assert len(hist2.json()) == 0

    # 4. Feedback submission ("Was this correct?") & ownership enforcement
    forbidden_fb = client.post(
        f"/api/history/{pred_id}/feedback",
        headers=headers_user2,
        json={"is_correct": False, "correct_label": "safe"},
    )
    assert forbidden_fb.status_code == 404

    ok_fb = client.post(
        f"/api/history/{pred_id}/feedback",
        headers=headers_user1,
        json={"is_correct": True, "comment": "Clearly a prize scam"},
    )
    assert ok_fb.status_code == 200
    assert ok_fb.json()["feedback_is_correct"] is True
    assert ok_fb.json()["feedback_comment"] == "Clearly a prize scam"

    # 5. Model Registry lists both SMS and URL active models with metrics & limitations
    reg_res = client.get("/api/models", headers=headers_user1)
    assert reg_res.status_code == 200
    models = reg_res.json()
    sub_models = {(m["module"], m["sub_model"]) for m in models}
    assert ("scam", "sms") in sub_models
    assert ("scam", "url") in sub_models
    scam_models = [m for m in models if m["module"] == "scam"]
    assert len(scam_models) == 2
    for m in scam_models:
        assert len(m["comparison_table"]) >= 3
        assert len(m["limitations"]) >= 1
        assert "pr_auc" in m["metrics"]
