"""Health Check ML inference, calibration inspection, and explainability service."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
import sys
from typing import Any

from fastapi import HTTPException, status
import joblib
import numpy as np
import pandas as pd
import shap

from app.config import settings

# Ensure `ml/` is importable before unpickling joblib pipelines referencing ml.health.features
ML_PARENT_DIR = Path(settings.ML_DIR).resolve().parent
if str(ML_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(ML_PARENT_DIR))

from ml.health.features import DIABETES_RAW_COLUMNS, HEART_RAW_COLUMNS  # noqa: E402

FEATURE_LABELS = {
    # Diabetes features
    "Pregnancies": "Pregnancies",
    "Glucose": "Plasma Glucose (mg/dL)",
    "BloodPressure": "Diastolic BP (mm Hg)",
    "SkinThickness": "Skin Thickness (mm)",
    "Insulin": "Serum Insulin (mu U/ml)",
    "BMI": "BMI (kg/m^2)",
    "DiabetesPedigreeFunction": "Diabetes Pedigree Fn",
    "Age": "Age (years)",
    # Heart features
    "age": "Age (years)",
    "sex": "Biological Sex",
    "cp": "Chest Pain Type",
    "trestbps": "Resting BP (mm Hg)",
    "chol": "Cholesterol (mg/dL)",
    "fbs": "Fasting Sugar > 120",
    "restecg": "Resting ECG",
    "thalach": "Max Heart Rate",
    "exang": "Exercise Angina",
    "oldpeak": "ST Depression (oldpeak)",
    "slope": "Exercise ST Slope",
    "ca": "Fluoroscopy Vessels (ca)",
    "thal": "Thallium Scan (thal)",
}

HEART_CODE_LABELS = {
    "sex": {0: "Female (0)", 1: "Male (1)"},
    "cp": {1: "Typical Angina (1)", 2: "Atypical (2)", 3: "Non-anginal (3)", 4: "Asymptomatic (4)"},
    "fbs": {0: "Normal <=120 (0)", 1: ">120 mg/dL (1)"},
    "restecg": {0: "Normal (0)", 1: "ST-T Abnormality (1)", 2: "LVH (2)"},
    "exang": {0: "No (0)", 1: "Yes (1)"},
    "slope": {1: "Upsloping (1)", 2: "Flat (2)", 3: "Downsloping (3)"},
    "thal": {3: "Normal (3)", 6: "Fixed Defect (6)", 7: "Reversible (7)"},
}


def _artifacts_dir() -> Path:
    return Path(settings.ML_DIR) / "health" / "artifacts"


@lru_cache(maxsize=4)
def _load_bundle(bundle_filename: str) -> dict[str, Any]:
    bundle_path = _artifacts_dir() / bundle_filename
    if not bundle_path.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Health Check model artifact '{bundle_filename}' not found. "
                "Run `python ml/health/train.py` first."
            ),
        )
    return joblib.load(bundle_path)


@lru_cache(maxsize=16)
def _get_tree_explainer(model_key: str, clf: Any) -> shap.TreeExplainer:
    return shap.TreeExplainer(clf)


def clear_health_model_cache() -> None:
    """Clear cached joblib bundles and SHAP explainers (useful in tests or after retraining)."""
    _load_bundle.cache_clear()
    _get_tree_explainer.cache_clear()


def _map_health_tier(prob: float, t_low: float, t_high: float) -> str:
    if prob >= t_high:
        return "elevated_risk"
    if prob >= t_low:
        return "moderate_risk"
    return "low_risk"


def _format_feature_value(sub_model: str, col: str, raw_val: Any) -> tuple[float | str, float | str | None]:
    if raw_val is None or (isinstance(raw_val, (float, np.floating)) and np.isnan(raw_val)):
        return "Not provided (imputed)", None

    if sub_model == "heart" and col in HEART_CODE_LABELS:
        code = int(round(float(raw_val)))
        return HEART_CODE_LABELS[col].get(code, str(code)), code

    num = float(raw_val)
    if col in ("Pregnancies", "Age", "age", "trestbps", "chol", "thalach", "ca"):
        rounded = int(round(num))
        return rounded, float(rounded)
    rounded = round(num, 3)
    return rounded, rounded


def _single_pipeline_grouped_contrib(
    key_prefix: str, pipe: Any, raw_df: pd.DataFrame, columns: list[str]
) -> dict[str, float]:
    """Compute one inner pipeline's feature contributions grouped by original column."""
    cleaned_df = pipe.named_steps["clean"].transform(raw_df)
    preprocess_step = pipe.named_steps["preprocess"]
    clf = pipe.named_steps["clf"]

    X_pre = preprocess_step.transform(cleaned_df)
    transformed_names = preprocess_step.get_feature_names_out()

    if hasattr(clf, "coef_"):
        contrib_row = np.asarray(X_pre[0], dtype=np.float64) * np.asarray(clf.coef_[0], dtype=np.float64)
    else:
        explainer = _get_tree_explainer(f"{key_prefix}:{type(clf).__name__}", clf)
        raw_shap = explainer.shap_values(X_pre)
        if isinstance(raw_shap, list):
            contrib_row = np.asarray(raw_shap[1][0], dtype=np.float64)
        else:
            arr = np.asarray(raw_shap, dtype=np.float64)
            if arr.ndim == 3:
                contrib_row = arr[0, :, 1]
            elif arr.ndim == 2:
                contrib_row = arr[0]
            else:
                contrib_row = arr.reshape(-1)

    cols_desc = sorted(columns, key=len, reverse=True)
    grouped: dict[str, float] = {col: 0.0 for col in columns}
    for feat_name, val in zip(transformed_names, contrib_row):
        for col in cols_desc:
            if (
                feat_name == f"num__{col}"
                or feat_name == f"num__missingindicator_{col}"
                or feat_name.startswith(f"cat__{col}_")
            ):
                grouped[col] += float(val)
                break
    return grouped


def _compute_health_attributions(
    sub_model: str, model: Any, raw_df: pd.DataFrame, raw_cols: list[str]
) -> tuple[list[dict[str, Any]], dict[str, float | str | None]]:
    """Aggregate feature attributions across calibrated CV estimators cleanly."""
    if hasattr(model, "calibrated_classifiers_"):
        fold_dicts = [
            _single_pipeline_grouped_contrib(f"{sub_model}:{idx}", cal.estimator, raw_df, raw_cols)
            for idx, cal in enumerate(model.calibrated_classifiers_)
        ]
        # Reference cleaned dataframe from fold 0 for biological zero -> NaN display
        ref_cleaned = model.calibrated_classifiers_[0].estimator.named_steps["clean"].transform(raw_df)
        averaged = {
            col: float(np.mean([d[col] for d in fold_dicts]))
            for col in raw_cols
        }
    else:
        ref_cleaned = model.named_steps["clean"].transform(raw_df)
        averaged = _single_pipeline_grouped_contrib(f"{sub_model}:single", model, raw_df, raw_cols)

    extracted_clean: dict[str, float | str | None] = {}
    contributors: list[dict[str, Any]] = []
    for col in raw_cols:
        display_val, clean_val = _format_feature_value(sub_model, col, ref_cleaned.iloc[0][col])
        extracted_clean[col] = clean_val
        score = float(averaged[col])
        contributors.append(
            {
                "feature": FEATURE_LABELS.get(col, col),
                "value": display_val,
                "contribution": round(score, 4),
                "direction": "higher_risk" if score >= 0 else "lower_risk",
            }
        )

    contributors.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    return contributors[:8], extracted_clean


def _run_health_screening(
    sub_model: str, bundle_filename: str, raw_df: pd.DataFrame, raw_cols: list[str]
) -> dict[str, Any]:
    bundle = _load_bundle(bundle_filename)
    model = bundle["pipeline"]
    t_low = float(bundle["threshold_low"])
    t_high = float(bundle["threshold_high"])
    disclaimer = str(bundle["disclaimer"])

    probs = model.predict_proba(raw_df)[0]
    cal_prob = float(probs[1])
    low_prob = float(probs[0])
    tier = _map_health_tier(cal_prob, t_low, t_high)

    contributors, extracted_clean = _compute_health_attributions(sub_model, model, raw_df, raw_cols)

    top_up = [c["feature"] for c in contributors if c["direction"] == "higher_risk"][:2]
    top_down = [c["feature"] for c in contributors if c["direction"] == "lower_risk"][:2]
    parts = []
    if top_up:
        parts.append(f"elevating signals ({', '.join(top_up)})")
    if top_down:
        parts.append(f"protective signals ({', '.join(top_down)})")
    factor_text = " and ".join(parts) if parts else "balanced clinical profile"

    tier_label = tier.replace("_", " ").upper()
    summary = (
        f"Awareness screening tier: {tier_label} ({cal_prob:.1%} calibrated probability), "
        f"influenced by {factor_text}. Awareness only — consult a physician for diagnosis."
    )

    return {
        "sub_model": sub_model,
        "risk_tier": tier,
        "calibrated_probability": round(cal_prob, 4),
        "low_risk_probability": round(low_prob, 4),
        "threshold_moderate": t_low,
        "threshold_elevated": t_high,
        "model_name": bundle["model_name"],
        "model_version": bundle["version"],
        "disclaimer": disclaimer,
        "top_contributors": contributors,
        "extracted_features": extracted_clean,
        "explanation_summary": summary,
    }


def predict_diabetes_risk(payload: dict[str, Any]) -> dict[str, Any]:
    """Run calibrated diabetes awareness screening from 8 clinical parameters."""
    row = {
        col: (np.nan if payload.get(col) is None else float(payload[col]))
        for col in DIABETES_RAW_COLUMNS
    }
    raw_df = pd.DataFrame([row], columns=DIABETES_RAW_COLUMNS)
    return _run_health_screening("diabetes", "diabetes_health_bundle.joblib", raw_df, DIABETES_RAW_COLUMNS)


def predict_heart_risk(payload: dict[str, Any]) -> dict[str, Any]:
    """Run calibrated UCI Cleveland heart disease awareness screening."""
    row = {
        col: (np.nan if payload.get(col) is None else float(payload[col]))
        for col in HEART_RAW_COLUMNS
    }
    raw_df = pd.DataFrame([row], columns=HEART_RAW_COLUMNS)
    return _run_health_screening("heart", "heart_health_bundle.joblib", raw_df, HEART_RAW_COLUMNS)


def get_health_options() -> dict[str, Any]:
    """Return UI clinical select options, disclaimer, and calibration curve telemetry."""
    d_bundle = _load_bundle("diabetes_health_bundle.joblib")
    h_bundle = _load_bundle("heart_health_bundle.joblib")

    meta_path = _artifacts_dir() / "metadata.json"
    cal_curves: dict[str, Any] = {}
    if meta_path.exists():
        for entry in json.loads(meta_path.read_text(encoding="utf-8")):
            cal_curves[entry["sub_model"]] = {
                "cv_oof": entry["metrics"].get("calibration_curve_cv_oof"),
                "test": entry["metrics"].get("calibration_curve_test"),
                "brier_score": entry["metrics"].get("brier_score"),
                "roc_auc": entry["metrics"].get("roc_auc"),
            }

    return {
        "disclaimer": d_bundle.get("disclaimer"),
        "diabetes": d_bundle.get("ui_options", {}),
        "heart": h_bundle.get("ui_options", {}),
        "calibration_curves": cal_curves,
    }
