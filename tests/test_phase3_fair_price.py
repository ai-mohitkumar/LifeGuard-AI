"""Phase 3 tests: Fair Price feature extractors, car/bike endpoints, history, feedback, and registry."""

from pathlib import Path
import sys

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.price.features import (  # noqa: E402
    BIKE_RAW_COLUMNS,
    CAR_RAW_COLUMNS,
    BikeFeatureExtractor,
    CarFeatureExtractor,
)


def _register_and_get_headers(client, email: str, full_name: str = "Price Tester") -> dict[str, str]:
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


def test_car_and_bike_feature_extractors():
    car_df = pd.DataFrame(
        [
            {
                "name": "Maruti Swift Dzire VDI",
                "year": 2016,
                "km_driven": 40000,
                "fuel": "Diesel",
                "seller_type": "Individual",
                "transmission": "Manual",
                "owner": "First Owner",
            },
            {
                "name": "Land Rover Discovery Sport SD4",
                "year": 2020,
                "km_driven": 10000,
                "fuel": "Diesel",
                "seller_type": "Dealer",
                "transmission": "Automatic",
                "owner": "First Owner",
            },
        ],
        columns=CAR_RAW_COLUMNS,
    )
    car_out = CarFeatureExtractor(reference_year=2020).transform(car_df)
    assert car_out.loc[0, "brand"] == "maruti"
    assert car_out.loc[0, "model_word"] == "swift"
    assert car_out.loc[0, "vehicle_age"] == 4
    assert car_out.loc[0, "km_per_year"] == 10000.0
    assert car_out.loc[1, "brand"] == "land rover"
    assert car_out.loc[1, "model_word"] == "discovery"
    assert car_out.loc[1, "vehicle_age"] == 0

    bike_df = pd.DataFrame(
        [
            {
                "name": "Royal Enfield Classic 350",
                "year": 2018,
                "km_driven": 14000,
                "seller_type": "Individual",
                "owner": "1st owner",
                "ex_showroom_price": np.nan,
            },
            {
                "name": "Hero Honda Splendor Plus",
                "year": 2014,
                "km_driven": 36000,
                "seller_type": "Individual",
                "owner": "2nd owner",
                "ex_showroom_price": 52000.0,
            },
        ],
        columns=BIKE_RAW_COLUMNS,
    )
    bike_out = BikeFeatureExtractor(reference_year=2020).transform(bike_df)
    assert bike_out.loc[0, "brand"] == "royal enfield"
    assert bike_out.loc[0, "model_word"] == "classic"
    assert bike_out.loc[0, "engine_cc_hint"] == 350.0
    assert np.isnan(bike_out.loc[0, "ex_showroom_price"])
    assert bike_out.loc[1, "brand"] == "hero honda"
    assert np.isnan(bike_out.loc[1, "engine_cc_hint"])


def test_price_endpoints_require_authentication(client):
    assert client.get("/api/price/options").status_code == 401
    assert (
        client.post(
            "/api/price/predict-car",
            json={
                "name": "Maruti Swift Dzire VDI",
                "year": 2016,
                "km_driven": 55000,
                "fuel": "Diesel",
                "seller_type": "Individual",
                "transmission": "Manual",
                "owner": "First Owner",
            },
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/price/predict-bike",
            json={
                "name": "Royal Enfield Classic 350",
                "year": 2018,
                "km_driven": 15000,
                "seller_type": "Individual",
                "owner": "1st owner",
            },
        ).status_code
        == 401
    )


def test_car_bike_prediction_shap_history_feedback_and_registry(client):
    headers = _register_and_get_headers(client, "buyer@example.com", "Buyer One")

    # 1. Options endpoint returns car & bike dropdown lists
    opts_res = client.get("/api/price/options", headers=headers)
    assert opts_res.status_code == 200
    opts = opts_res.json()
    assert "Diesel" in opts["car"]["fuels"]
    assert "Individual" in opts["bike"]["seller_types"]

    # 2. Used Car price prediction + SHAP breakdown
    car_res = client.post(
        "/api/price/predict-car",
        headers=headers,
        json={
            "name": "Maruti Swift Dzire VDI",
            "year": 2016,
            "km_driven": 55000,
            "fuel": "Diesel",
            "seller_type": "Individual",
            "transmission": "Manual",
            "owner": "First Owner",
        },
    )
    assert car_res.status_code == 200
    car_data = car_res.json()
    assert car_data["sub_model"] == "car"
    assert car_data["predicted_price_inr"] > 50_000
    assert car_data["price_range_low_inr"] <= car_data["predicted_price_inr"] <= car_data["price_range_high_inr"]
    assert len(car_data["top_contributors"]) >= 5
    car_pred_id = car_data["prediction_id"]

    # 3. Used Bike prediction WITHOUT ex_showroom_price (tests in-pipeline imputation)
    bike_res_missing = client.post(
        "/api/price/predict-bike",
        headers=headers,
        json={
            "name": "Royal Enfield Classic 350",
            "year": 2018,
            "km_driven": 15000,
            "seller_type": "Individual",
            "owner": "1st owner",
            "ex_showroom_price": None,
        },
    )
    assert bike_res_missing.status_code == 200
    bike_data = bike_res_missing.json()
    assert bike_data["sub_model"] == "bike"
    assert bike_data["predicted_price_inr"] > 10_000
    assert bike_data["extracted_features"]["ex_showroom_price"] is None
    assert bike_data["extracted_features"]["engine_cc_hint"] == 350.0
    assert len(bike_data["top_contributors"]) >= 5

    # 4. Prediction History logs Fair Price runs & accepts regression feedback
    hist_res = client.get("/api/history?module=price", headers=headers)
    assert hist_res.status_code == 200
    hist = hist_res.json()
    assert len(hist) == 2

    fb_res = client.post(
        f"/api/history/{car_pred_id}/feedback",
        headers=headers,
        json={
            "is_correct": False,
            "correct_label": "overestimated",
            "comment": "Dealer quote was Rs 5,00,000",
        },
    )
    assert fb_res.status_code == 200
    assert fb_res.json()["feedback_is_correct"] is False
    assert fb_res.json()["feedback_label"] == "overestimated"

    # 5. Model Registry includes both car & bike regression entries
    reg_res = client.get("/api/models", headers=headers)
    assert reg_res.status_code == 200
    models = reg_res.json()
    price_models = [m for m in models if m["module"] == "price"]
    assert {(m["module"], m["sub_model"]) for m in price_models} == {
        ("price", "car"),
        ("price", "bike"),
    }
    for m in price_models:
        assert len(m["comparison_table"]) == 5
        assert len(m["limitations"]) >= 2
        assert {"mae", "rmse", "r2"}.issubset(m["metrics"].keys())
