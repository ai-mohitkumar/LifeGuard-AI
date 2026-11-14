"""Phase 4 tests: Health Check clinical cleaners, calibration, screening endpoints, and registry."""

from pathlib import Path
import sys

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.health.features import (  # noqa: E402
    DIABETES_RAW_COLUMNS,
    HEART_RAW_COLUMNS,
    DiabetesClinicalCleaner,
    HeartClinicalFormatter,
)


def _register_and_get_headers(client, email: str, full_name: str = "Health Tester") -> dict[str, str]:
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


def test_diabetes_and_heart_cleaners():
    diabetes_df = pd.DataFrame(
        [
            {
                "Pregnancies": 2,
                "Glucose": 0,  # biological invalid zero -> NaN
                "BloodPressure": 74,
                "SkinThickness": 0,
                "Insulin": 0,
                "BMI": 31.2,
                "DiabetesPedigreeFunction": 0.45,
                "Age": 34,
            }
        ],
        columns=DIABETES_RAW_COLUMNS,
    )
    cleaned = DiabetesClinicalCleaner().transform(diabetes_df)
    assert np.isnan(cleaned.loc[0, "Glucose"])
    assert np.isnan(cleaned.loc[0, "SkinThickness"])
    assert np.isnan(cleaned.loc[0, "Insulin"])
    assert cleaned.loc[0, "BloodPressure"] == 74.0
    assert cleaned.loc[0, "Pregnancies"] == 2.0  # Pregnancies=0 stays 0

    heart_df = pd.DataFrame(
        [
            {
                "age": 54,
                "sex": 1,
                "cp": 3,
                "trestbps": 130,
                "chol": 240,
                "fbs": 0,
                "restecg": 0,
                "thalach": 150,
                "exang": 0,
                "oldpeak": 1.2,
                "slope": 2,
                "ca": None,
                "thal": None,
            }
        ],
        columns=HEART_RAW_COLUMNS,
    )
    heart_out = HeartClinicalFormatter().transform(heart_df)
    assert heart_out.loc[0, "cp"] == 3.0
    assert np.isnan(heart_out.loc[0, "ca"])
    assert np.isnan(heart_out.loc[0, "thal"])


def test_health_endpoints_require_authentication(client):
    assert client.get("/api/health-check/options").status_code == 401
    assert (
        client.post(
            "/api/health-check/predict-diabetes",
            json={
                "Pregnancies": 2,
                "Glucose": 120,
                "BloodPressure": 72,
                "SkinThickness": 25,
                "Insulin": 95,
                "BMI": 28.0,
                "DiabetesPedigreeFunction": 0.42,
                "Age": 35,
            },
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/health-check/predict-heart",
            json={
                "age": 54,
                "sex": 1,
                "cp": 3,
                "trestbps": 134,
                "chol": 238,
                "fbs": 0,
                "restecg": 0,
                "thalach": 148,
                "exang": 0,
                "oldpeak": 1.0,
                "slope": 2,
            },
        ).status_code
        == 401
    )


def test_health_screening_calibration_disclaimer_history_and_registry(client):
    headers = _register_and_get_headers(client, "patient@example.com", "Patient One")

    # 1. Options endpoint provides disclaimer & calibration curves
    opts_res = client.get("/api/health-check/options", headers=headers)
    assert opts_res.status_code == 200
    opts = opts_res.json()
    assert "not a medical diagnosis" in opts["disclaimer"].lower()
    assert "diabetes" in opts["calibration_curves"]
    assert "heart" in opts["calibration_curves"]

    # 2. Diabetes prediction WITH missing Glucose & Insulin (in-pipeline imputation)
    d_res = client.post(
        "/api/health-check/predict-diabetes",
        headers=headers,
        json={
            "Pregnancies": 5,
            "Glucose": 168.0,
            "BloodPressure": 84.0,
            "SkinThickness": None,
            "Insulin": None,
            "BMI": 36.4,
            "DiabetesPedigreeFunction": 0.88,
            "Age": 49,
        },
    )
    assert d_res.status_code == 200
    d_data = d_res.json()
    assert d_data["sub_model"] == "diabetes"
    assert d_data["risk_tier"] in ("moderate_risk", "elevated_risk")
    assert 0.0 <= d_data["calibrated_probability"] <= 1.0
    assert "awareness" in d_data["disclaimer"].lower()
    assert len(d_data["top_contributors"]) == 8
    assert d_data["extracted_features"]["Insulin"] is None
    d_pred_id = d_data["prediction_id"]

    # 3. Heart disease prediction WITHOUT optional ca/thal
    h_res = client.post(
        "/api/health-check/predict-heart",
        headers=headers,
        json={
            "age": 62,
            "sex": 1,
            "cp": 4,
            "trestbps": 152,
            "chol": 282,
            "fbs": 1,
            "restecg": 2,
            "thalach": 118,
            "exang": 1,
            "oldpeak": 2.6,
            "slope": 2,
            "ca": None,
            "thal": None,
        },
    )
    assert h_res.status_code == 200
    h_data = h_res.json()
    assert h_data["sub_model"] == "heart"
    assert h_data["risk_tier"] == "elevated_risk"
    assert len(h_data["top_contributors"]) == 8
    assert h_data["extracted_features"]["ca"] is None

    # 4. Prediction History logs health entries + accepts screening feedback
    hist_res = client.get("/api/history?module=health", headers=headers)
    assert hist_res.status_code == 200
    assert len(hist_res.json()) == 2

    fb_res = client.post(
        f"/api/history/{d_pred_id}/feedback",
        headers=headers,
        json={
            "is_correct": True,
            "comment": "Flagged elevated risk; scheduled HbA1c test",
        },
    )
    assert fb_res.status_code == 200
    assert fb_res.json()["feedback_is_correct"] is True

    # 5. Model Registry exposes both calibrated health models + Brier & ROC-AUC + calibration curves
    reg_res = client.get("/api/models", headers=headers)
    assert reg_res.status_code == 200
    models = reg_res.json()
    health_models = [m for m in models if m["module"] == "health"]
    assert {(m["module"], m["sub_model"]) for m in health_models} == {
        ("health", "diabetes"),
        ("health", "heart"),
    }
    for m in health_models:
        assert len(m["comparison_table"]) == 5
        assert len(m["limitations"]) >= 2
        assert {"recall", "roc_auc", "brier_score", "calibration_curve_test"}.issubset(
            m["metrics"].keys()
        )
