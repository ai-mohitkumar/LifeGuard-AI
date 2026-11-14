"""Fair Price ML inference and SHAP explainability service (Used Cars & Bikes)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import sys
from typing import Any

from fastapi import HTTPException, status
import joblib
import numpy as np
import pandas as pd
import shap

from app.config import settings

# Ensure `ml/` is importable before unpickling joblib pipelines referencing ml.price.features
ML_PARENT_DIR = Path(settings.ML_DIR).resolve().parent
if str(ML_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(ML_PARENT_DIR))

from ml.price.features import BIKE_RAW_COLUMNS, CAR_RAW_COLUMNS  # noqa: E402

FEATURE_LABELS = {
    "year": "Manufacture Year",
    "vehicle_age": "Vehicle Age (yrs)",
    "km_driven": "Odometer (km)",
    "km_per_year": "Avg km / year",
    "ex_showroom_price": "Ex-Showroom Price",
    "engine_cc_hint": "Engine CC (parsed)",
    "brand": "Brand",
    "model_word": "Model Family",
    "fuel": "Fuel Type",
    "seller_type": "Seller Type",
    "transmission": "Transmission",
    "owner": "Ownership",
}


def _artifacts_dir() -> Path:
    return Path(settings.ML_DIR) / "price" / "artifacts"


@lru_cache(maxsize=4)
def _load_bundle(bundle_filename: str) -> dict[str, Any]:
    bundle_path = _artifacts_dir() / bundle_filename
    if not bundle_path.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Fair Price model artifact '{bundle_filename}' not found. "
                "Run `python ml/price/train.py` first."
            ),
        )
    return joblib.load(bundle_path)


@lru_cache(maxsize=4)
def _get_tree_explainer(model_key: str, reg: Any) -> shap.TreeExplainer:
    return shap.TreeExplainer(reg)


def clear_price_model_cache() -> None:
    """Clear cached joblib bundles and SHAP explainers (useful in tests or after retraining)."""
    _load_bundle.cache_clear()
    _get_tree_explainer.cache_clear()


def _format_inr(amount: float) -> str:
    return f"Rs {round(amount):,.0f}"


def _format_feature_value(col: str, raw_val: Any) -> float | str | None:
    if raw_val is None or (isinstance(raw_val, float) and np.isnan(raw_val)):
        return "Not provided (imputed)"
    if col in ("year", "vehicle_age", "km_driven", "engine_cc_hint", "ex_showroom_price"):
        return round(float(raw_val), 0)
    if col == "km_per_year":
        return round(float(raw_val), 1)
    return str(raw_val)


def _compute_shap_attributions(
    sub_model: str, pipeline: Any, raw_df: pd.DataFrame
) -> tuple[float, list[dict[str, Any]], dict[str, float | str | None]]:
    """Compute exact additive SHAP attributions grouped back to domain features."""
    extract_step = pipeline.named_steps["extract"]
    preprocess_step = pipeline.named_steps["preprocess"]
    reg = pipeline.named_steps["reg"]

    extracted_df = extract_step.transform(raw_df)
    X_pre = preprocess_step.transform(extracted_df)
    transformed_names = preprocess_step.get_feature_names_out()

    if hasattr(reg, "coef_"):
        shap_row = np.asarray(X_pre[0], dtype=np.float64) * np.asarray(reg.coef_, dtype=np.float64)
        baseline_price = float(reg.intercept_)
    else:
        explainer = _get_tree_explainer(f"{sub_model}:{type(reg).__name__}", reg)
        raw_shap = explainer.shap_values(X_pre)
        arr = np.asarray(raw_shap, dtype=np.float64)
        shap_row = arr[0] if arr.ndim == 2 else arr.reshape(-1)
        baseline_price = float(np.asarray(explainer.expected_value, dtype=np.float64).reshape(-1)[0])

    cols_desc = sorted(extracted_df.columns.tolist(), key=len, reverse=True)
    grouped_shap: dict[str, float] = {col: 0.0 for col in extracted_df.columns}

    for feat_name, phi in zip(transformed_names, shap_row):
        for col in cols_desc:
            if (
                feat_name == f"num__{col}"
                or feat_name == f"num__missingindicator_{col}"
                or feat_name.startswith(f"cat__{col}_")
            ):
                grouped_shap[col] += float(phi)
                break

    extracted_clean: dict[str, float | str | None] = {}
    contributors: list[dict[str, Any]] = []

    for col in extracted_df.columns:
        raw_val = extracted_df.iloc[0][col]
        clean_val = _format_feature_value(col, raw_val)
        extracted_clean[col] = None if clean_val == "Not provided (imputed)" else clean_val

        contrib = float(grouped_shap[col])
        contributors.append(
            {
                "feature": FEATURE_LABELS.get(col, col),
                "value": clean_val,
                "contribution_inr": round(contrib, 2),
                "direction": "increases_price" if contrib >= 0 else "decreases_price",
            }
        )

    contributors.sort(key=lambda item: abs(item["contribution_inr"]), reverse=True)
    return max(0.0, baseline_price), contributors[:8], extracted_clean


def _build_price_response(sub_model: str, bundle_filename: str, raw_df: pd.DataFrame) -> dict[str, Any]:
    bundle = _load_bundle(bundle_filename)
    pipeline = bundle["pipeline"]
    test_mae = float(bundle["test_mae"])

    raw_pred = float(pipeline.predict(raw_df)[0])
    pred_inr = max(0.0, round(raw_pred, 2))
    range_low = max(0.0, round(pred_inr - test_mae, 0))
    range_high = round(pred_inr + test_mae, 0)

    baseline_inr, contributors, extracted_clean = _compute_shap_attributions(
        sub_model, pipeline, raw_df
    )

    up_drivers = [c["feature"] for c in contributors if c["direction"] == "increases_price"][:2]
    down_drivers = [c["feature"] for c in contributors if c["direction"] == "decreases_price"][:2]
    parts = []
    if up_drivers:
        parts.append(f"upward push from {', '.join(up_drivers)}")
    if down_drivers:
        parts.append(f"depreciation/downward push from {', '.join(down_drivers)}")
    driver_clause = " and ".join(parts) if parts else "balanced baseline vehicle traits"

    summary = (
        f"Estimated fair market value is {_format_inr(pred_inr)} "
        f"(typical test-MAE band {_format_inr(range_low)} - {_format_inr(range_high)}) "
        f"vs dataset baseline {_format_inr(baseline_inr)}, shaped by {driver_clause}."
    )

    return {
        "sub_model": sub_model,
        "predicted_price_inr": pred_inr,
        "price_range_low_inr": range_low,
        "price_range_high_inr": range_high,
        "uncertainty_mae_inr": round(test_mae, 2),
        "baseline_price_inr": round(baseline_inr, 2),
        "model_name": bundle["model_name"],
        "model_version": bundle["version"],
        "top_contributors": contributors,
        "extracted_features": extracted_clean,
        "explanation_summary": summary,
    }


def predict_car_price(payload: dict[str, Any]) -> dict[str, Any]:
    """Estimate fair used car price in INR along with grouped SHAP attributions."""
    row = {col: payload[col] for col in CAR_RAW_COLUMNS}
    raw_df = pd.DataFrame([row])
    return _build_price_response("car", "car_price_bundle.joblib", raw_df)


def predict_bike_price(payload: dict[str, Any]) -> dict[str, Any]:
    """Estimate fair used bike price in INR along with grouped SHAP attributions."""
    row = {
        "name": payload["name"],
        "year": payload["year"],
        "km_driven": payload["km_driven"],
        "seller_type": payload["seller_type"],
        "owner": payload["owner"],
        "ex_showroom_price": (
            np.nan if payload.get("ex_showroom_price") is None else float(payload["ex_showroom_price"])
        ),
    }
    raw_df = pd.DataFrame([row], columns=BIKE_RAW_COLUMNS)
    return _build_price_response("bike", "bike_price_bundle.joblib", raw_df)


def get_price_options() -> dict[str, dict[str, Any]]:
    """Return UI dropdown options & valid year bounds from saved Fair Price bundles."""
    car_bundle = _load_bundle("car_price_bundle.joblib")
    bike_bundle = _load_bundle("bike_price_bundle.joblib")
    return {
        "car": car_bundle.get("ui_options", {}),
        "bike": bike_bundle.get("ui_options", {}),
    }
