"""Phase 5 tests: All-India Air Aware causal lags, feature extractor, station & India outlook APIs, history, and registry."""

from pathlib import Path
import sys

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.aqi.features import (  # noqa: E402
    AQI_CATEGORIES,
    AQI_RAW_COLUMNS,
    AqiFeatureExtractor,
    build_causal_station_history,
)
from ml.aqi.india_stations import ALL_INDIA_STATES_AND_UTS  # noqa: E402


def _register_and_get_headers(client, email: str, full_name: str = "AQI Tester") -> dict[str, str]:
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


def test_causal_station_history_prevents_leakage_and_handles_gaps():
    raw = pd.DataFrame(
        [
            {
                "station": "Alpha",
                "date": "2025-01-01",
                "PM2.5": 40.0,
                "PM10": 60.0,
                "SO2": 10.0,
                "NO2": 30.0,
                "CO_mg": 0.8,
                "O3": 50.0,
                "TEMP": 18.0,
                "PRES": 1015.0,
                "DEWP": 8.0,
                "RAIN": 0.0,
                "WSPM": 2.5,
                "AQI": 80.0,
                "AQI_Category": "Satisfactory",
            },
            {
                "station": "Alpha",
                "date": "2025-01-02",
                "PM2.5": 90.0,
                "PM10": 130.0,
                "SO2": 18.0,
                "NO2": 55.0,
                "CO_mg": 1.4,
                "O3": 42.0,
                "TEMP": 16.0,
                "PRES": 1017.0,
                "DEWP": 9.0,
                "RAIN": 0.0,
                "WSPM": 1.2,
                "AQI": 195.0,
                "AQI_Category": "Moderate",
            },
            # Missing 2025-01-03 -> gap before 2025-01-04
            {
                "station": "Alpha",
                "date": "2025-01-04",
                "PM2.5": 180.0,
                "PM10": 240.0,
                "SO2": 25.0,
                "NO2": 80.0,
                "CO_mg": 2.8,
                "O3": 35.0,
                "TEMP": 14.0,
                "PRES": 1018.0,
                "DEWP": 10.0,
                "RAIN": 0.0,
                "WSPM": 0.8,
                "AQI": 345.0,
                "AQI_Category": "Very Poor",
            },
            # Second station must stay isolated from Alpha
            {
                "station": "Beta",
                "date": "2025-01-02",
                "PM2.5": 20.0,
                "PM10": 35.0,
                "SO2": 6.0,
                "NO2": 20.0,
                "CO_mg": 0.4,
                "O3": 68.0,
                "TEMP": 26.0,
                "PRES": 1012.0,
                "DEWP": 18.0,
                "RAIN": 0.0,
                "WSPM": 4.0,
                "AQI": 42.0,
                "AQI_Category": "Good",
            },
        ]
    )

    paired = build_causal_station_history(raw)
    # Only (Alpha 2025-01-01 -> 2025-01-02) is an exact +1 day pair
    assert len(paired) == 1
    assert paired.loc[0, "station"] == "Alpha"
    assert paired.loc[0, "date"] == "2025-01-01"
    assert paired.loc[0, "next_day_aqi"] == 195.0
    assert paired.loc[0, "next_day_category"] == "Moderate"
    assert paired.loc[0, "aqi_roll3_mean"] == 80.0  # causal: cannot include 195.0


def test_aqi_feature_extractor_preserves_missing_values_and_resolves_india_geo():
    df = pd.DataFrame(
        [
            {
                "station": "ITO Delhi CPCB",
                "date": "2026-01-15",
                "PM2.5": np.nan,
                "PM10": 140.0,
                "SO2": 20.0,
                "NO2": 62.0,
                "CO_mg": 1.6,
                "O3": 48.0,
                "TEMP": 15.0,
                "PRES": 1018.0,
                "DEWP": 7.0,
                "RAIN": 0.0,
                "WSPM": 1.5,
                "AQI": 210.0,
                "aqi_lag1": np.nan,
                "aqi_roll3_mean": np.nan,
                "aqi_roll7_mean": np.nan,
                "wspm_roll3_mean": np.nan,
            }
        ],
        columns=AQI_RAW_COLUMNS,
    )
    out = AqiFeatureExtractor().transform(df)
    assert out.loc[0, "is_winter_heating"] == 1.0
    assert out.loc[0, "temp_dew_spread"] == 8.0
    assert out.loc[0, "state"] == "Delhi"
    assert 20.0 < out.loc[0, "latitude"] < 35.0
    assert 70.0 < out.loc[0, "longitude"] < 85.0
    assert np.isnan(out.loc[0, "PM2.5"])
    assert np.isnan(out.loc[0, "aqi_lag1"])


def test_aqi_endpoints_require_authentication(client):
    assert client.get("/api/aqi/options").status_code == 401
    assert client.get("/api/aqi/india-overview").status_code == 401
    assert client.get("/api/aqi/station-live?station=ITO+Delhi+CPCB").status_code == 401
    assert (
        client.post(
            "/api/aqi/forecast",
            json={
                "station": "ITO Delhi CPCB",
                "state": "Delhi",
                "date": "2026-11-11",
                "PM10": 150.0,
                "TEMP": 20.0,
                "PRES": 1015.0,
                "DEWP": 12.0,
                "RAIN": 0.0,
                "WSPM": 1.5,
                "AQI": 215.0,
            },
        ).status_code
        == 401
    )


def test_aqi_forecast_india_overview_advisory_history_and_registry(client):
    headers = _register_and_get_headers(client, "air@example.com", "Air Forecaster")

    # 1. Options endpoint returns all 36 States/UTs, 545+ stations, categories, presets, and timelines
    opts_res = client.get("/api/aqi/options", headers=headers)
    assert opts_res.status_code == 200
    opts = opts_res.json()
    assert len(opts["states"]) == len(ALL_INDIA_STATES_AND_UTS) == 36
    assert len(opts["stations"]) >= 540
    assert opts["categories"] == AQI_CATEGORIES
    assert "timeline_sample" in opts
    assert "state_timelines" in opts
    assert len(opts["timeline_sample"]["dates"]) >= 10

    # 2. Forecast with omitted PM2.5 and causal lags (in-pipeline imputation path) for Delhi station
    f_res = client.post(
        "/api/aqi/forecast",
        headers=headers,
        json={
            "station": "ITO Delhi CPCB",
            "state": "Delhi",
            "date": "2026-11-11",
            "PM2.5": None,
            "PM10": 245.0,
            "SO2": 24.0,
            "NO2": 76.0,
            "CO_mg": 2.4,
            "O3": 48.0,
            "TEMP": 19.2,
            "PRES": 1016.0,
            "DEWP": 10.4,
            "RAIN": 0.0,
            "WSPM": 0.9,
            "AQI": 332.0,
            "aqi_lag1": None,
            "aqi_roll3_mean": None,
            "aqi_roll7_mean": None,
            "wspm_roll3_mean": None,
        },
    )
    assert f_res.status_code == 200
    data = f_res.json()
    assert 0.0 <= data["predicted_next_day_aqi"] <= 500.0
    assert data["aqi_range_low"] <= data["predicted_next_day_aqi"] <= data["aqi_range_high"]
    assert data["predicted_category"] in AQI_CATEGORIES
    assert set(data["category_probabilities"].keys()) == set(AQI_CATEGORIES)
    assert abs(sum(data["category_probabilities"].values()) - 1.0) <= 0.02
    assert data["health_advice"]["mask_guidance"]
    assert data["health_advice"]["sensitive_groups"]
    assert len(data["top_contributors"]) == 8
    assert data["extracted_features"]["aqi_lag1"] is None
    assert data["extracted_features"]["state"] == "Delhi"
    pred_id = data["prediction_id"]

    # 3. All-India Overview covers all 36 States/UTs and all 545+ stations
    overview_res = client.get("/api/aqi/india-overview", headers=headers)
    assert overview_res.status_code == 200
    overview = overview_res.json()
    assert overview["total_states"] == 36
    assert len(overview["states"]) == 36
    assert overview["total_stations"] >= 540
    assert len(overview["stations"]) >= 540
    assert {s["state"] for s in overview["states"]} == set(ALL_INDIA_STATES_AND_UTS.keys())

    # 4. Station live/cached lookup works for any State/UT (e.g., Goa or Nagaland)
    live_res = client.get(
        "/api/aqi/station-live?station=Patto+Centre+Panaji+GSPCB&state=Goa",
        headers=headers,
    )
    assert live_res.status_code == 200
    live = live_res.json()
    assert live["state"] == "Goa"
    assert 0.0 <= live["snapshot"]["AQI"] <= 500.0

    # 5. History logs forecast + accepts feedback
    hist_res = client.get("/api/history?module=aqi", headers=headers)
    assert hist_res.status_code == 200
    assert len(hist_res.json()) == 1

    fb_res = client.post(
        f"/api/history/{pred_id}/feedback",
        headers=headers,
        json={"is_correct": True, "comment": "Next-day winter haze warning matched observation"},
    )
    assert fb_res.status_code == 200
    assert fb_res.json()["feedback_is_correct"] is True

    # 6. Registry includes both AQI chronological models & comparison tables
    reg_res = client.get("/api/models", headers=headers)
    assert reg_res.status_code == 200
    aqi_models = [m for m in reg_res.json() if m["module"] == "aqi"]
    assert {(m["module"], m["sub_model"]) for m in aqi_models} == {
        ("aqi", "regressor"),
        ("aqi", "classifier"),
    }
    by_sub = {m["sub_model"]: m for m in aqi_models}
    assert {"mae", "rmse", "r2"}.issubset(by_sub["regressor"]["metrics"].keys())
    assert len(by_sub["regressor"]["comparison_table"]) == 5
    assert {"macro_f1", "weighted_f1", "adjacent_1_accuracy", "unhealthy_recall"}.issubset(
        by_sub["classifier"]["metrics"].keys()
    )
    assert len(by_sub["classifier"]["comparison_table"]) == 6
