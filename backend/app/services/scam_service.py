"""Scam Shield ML inference and explainability service."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import sys
from typing import Any

from fastapi import HTTPException, status
import joblib
import numpy as np
import shap

from app.config import settings

# Ensure the directory containing `ml/` is on sys.path before unpickling pipelines
ML_PARENT_DIR = Path(settings.ML_DIR).resolve().parent
if str(ML_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(ML_PARENT_DIR))

from ml.scam.features import URL_FEATURE_NAMES, extract_single_url_features  # noqa: E402


def _artifacts_dir() -> Path:
    return Path(settings.ML_DIR) / "scam" / "artifacts"


@lru_cache(maxsize=4)
def _load_bundle(bundle_filename: str) -> dict[str, Any]:
    bundle_path = _artifacts_dir() / bundle_filename
    if not bundle_path.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Scam Shield model artifact '{bundle_filename}' not found. "
                "Run `python ml/scam/train.py` first."
            ),
        )
    return joblib.load(bundle_path)


def clear_scam_model_cache() -> None:
    """Clear cached joblib bundles and SHAP explainers (useful in tests or after retraining)."""
    _load_bundle.cache_clear()
    _get_tree_explainer.cache_clear()


def _map_risk_tier(prob: float, t_low: float, t_high: float) -> str:
    if prob >= t_high:
        return "scam"
    if prob >= t_low:
        return "suspicious"
    return "safe"


def _extract_linear_text_weights(clf: Any) -> np.ndarray | None:
    """Return 1D per-token log-odds/coef vector for linear or Naive Bayes classifiers."""
    if hasattr(clf, "coef_"):
        return np.asarray(clf.coef_[0], dtype=np.float64)
    if hasattr(clf, "calibrated_classifiers_"):
        coefs = []
        for cal in clf.calibrated_classifiers_:
            est = getattr(cal, "estimator", None) or getattr(cal, "base_estimator", None)
            if est is not None and hasattr(est, "coef_"):
                coefs.append(np.asarray(est.coef_[0], dtype=np.float64))
        if coefs:
            return np.mean(coefs, axis=0)
    if hasattr(clf, "feature_log_prob_") and clf.feature_log_prob_.shape[0] >= 2:
        return np.asarray(clf.feature_log_prob_[1] - clf.feature_log_prob_[0], dtype=np.float64)
    return None


def predict_sms(text: str) -> dict[str, Any]:
    """Classify an SMS message and explain top contributing words/n-grams."""
    bundle = _load_bundle("sms_scam_bundle.joblib")
    pipeline = bundle["pipeline"]
    t_low = float(bundle["threshold_low"])
    t_high = float(bundle["threshold_high"])

    probs = pipeline.predict_proba([text])[0]
    scam_prob = float(probs[1])
    safe_prob = float(probs[0])
    label = _map_risk_tier(scam_prob, t_low, t_high)

    # Extract per-token contributions strictly from terms present in this SMS
    contributors: list[dict[str, Any]] = []
    vectorizer = pipeline.named_steps.get("tfidf")
    clf = pipeline.named_steps.get("clf")
    if vectorizer is not None and clf is not None:
        weights = _extract_linear_text_weights(clf)
        if weights is not None:
            vec = vectorizer.transform([text])
            vocab = vectorizer.get_feature_names_out()
            _, nonzero_cols = vec.nonzero()
            scored = []
            for col_idx in nonzero_cols:
                tfidf_val = float(vec[0, col_idx])
                contrib = tfidf_val * float(weights[col_idx])
                scored.append((abs(contrib), str(vocab[col_idx]), tfidf_val, contrib))
            scored.sort(key=lambda item: item[0], reverse=True)
            for _, token, tfidf_val, contrib in scored[:8]:
                contributors.append(
                    {
                        "feature": token,
                        "value": round(tfidf_val, 4),
                        "contribution": round(contrib, 4),
                        "direction": "scam" if contrib >= 0 else "safe",
                    }
                )

    if contributors:
        top_scam_words = [c["feature"] for c in contributors if c["direction"] == "scam"][:3]
        top_safe_words = [c["feature"] for c in contributors if c["direction"] == "safe"][:2]
        parts = []
        if top_scam_words:
            parts.append(f"scam-associated terms ({', '.join(top_scam_words)})")
        if top_safe_words:
            parts.append(f"safe-associated terms ({', '.join(top_safe_words)})")
        summary = f"Classified as {label.upper()} ({scam_prob:.1%} scam risk) driven by " + " and ".join(parts) + "."
    else:
        summary = f"Classified as {label.upper()} ({scam_prob:.1%} scam risk); no strong vocabulary keywords matched."

    return {
        "sub_model": "sms",
        "label": label,
        "scam_probability": round(scam_prob, 4),
        "safe_probability": round(safe_prob, 4),
        "threshold_low": t_low,
        "threshold_high": t_high,
        "model_name": bundle["model_name"],
        "model_version": bundle["version"],
        "top_contributors": contributors,
        "extracted_features": None,
        "explanation_summary": summary,
    }


@lru_cache(maxsize=2)
def _get_tree_explainer(model_key: str, clf: Any) -> shap.TreeExplainer:
    return shap.TreeExplainer(clf)


def _compute_url_shap_contributions(
    pipeline: Any, url: str, raw_feature_values: list[float]
) -> list[dict[str, Any]]:
    """Compute per-feature SHAP (for tree models) or linear log-odds contributions."""
    X_step = np.asarray([raw_feature_values], dtype=np.float64)
    for step_name, step_obj in pipeline.named_steps.items():
        if step_name in ("extract", "clf"):
            continue
        X_step = step_obj.transform(X_step)

    clf = pipeline.named_steps["clf"]
    if hasattr(clf, "coef_"):
        shap_row = X_step[0] * np.asarray(clf.coef_[0], dtype=np.float64)
    else:
        explainer = _get_tree_explainer(type(clf).__name__, clf)
        raw_shap = explainer.shap_values(X_step)
        if isinstance(raw_shap, list):
            # Binary RandomForest list output: [class_0_shap, class_1_shap]
            shap_row = np.asarray(raw_shap[1][0], dtype=np.float64)
        else:
            arr = np.asarray(raw_shap, dtype=np.float64)
            if arr.ndim == 3:
                # Shape (n_samples, n_features, n_classes)
                shap_row = arr[0, :, 1]
            elif arr.ndim == 2:
                shap_row = arr[0]
            else:
                shap_row = arr

    ranked = sorted(
        zip(URL_FEATURE_NAMES, raw_feature_values, shap_row),
        key=lambda item: abs(float(item[2])),
        reverse=True,
    )

    return [
        {
            "feature": name,
            "value": round(float(val), 4),
            "contribution": round(float(contrib), 4),
            "direction": "scam" if float(contrib) >= 0 else "safe",
        }
        for name, val, contrib in ranked[:8]
    ]


def predict_url(url: str) -> dict[str, Any]:
    """Classify a URL string using lexical features + SHAP explanation."""
    bundle = _load_bundle("url_scam_bundle.joblib")
    pipeline = bundle["pipeline"]
    t_low = float(bundle["threshold_low"])
    t_high = float(bundle["threshold_high"])

    probs = pipeline.predict_proba([url])[0]
    scam_prob = float(probs[1])
    safe_prob = float(probs[0])
    label = _map_risk_tier(scam_prob, t_low, t_high)

    raw_values = extract_single_url_features(url)
    extracted = {
        name: round(float(val), 4) for name, val in zip(URL_FEATURE_NAMES, raw_values)
    }
    contributors = _compute_url_shap_contributions(pipeline, url, raw_values)

    top_drivers = [f"{c['feature']}={c['value']}" for c in contributors[:3]]
    summary = (
        f"Classified as {label.upper()} ({scam_prob:.1%} phishing risk). "
        f"Top SHAP drivers: {', '.join(top_drivers)}."
    )

    return {
        "sub_model": "url",
        "label": label,
        "scam_probability": round(scam_prob, 4),
        "safe_probability": round(safe_prob, 4),
        "threshold_low": t_low,
        "threshold_high": t_high,
        "model_name": bundle["model_name"],
        "model_version": bundle["version"],
        "top_contributors": contributors,
        "extracted_features": extracted,
        "explanation_summary": summary,
    }
