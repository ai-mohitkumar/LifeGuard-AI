"""Leakage-safe training pipeline for LifeGuard AI Module 3: Health Check.

Trains and compares calibrated risk-screening models for two tracks:
  1. Diabetes Risk Screening (`diabetes.csv`, Pima Indians Diabetes - 768 rows)
  2. Heart Disease Risk Screening (`heart_cleveland.csv`, UCI Cleveland - 303 rows)

Strict ML guarantees:
  - Biologically invalid zeros (Diabetes Glucose/BP/Skin/Insulin/BMI) and missing
    values (Heart ca/thal) are converted/imputed INSIDE CV folds via Pipeline.
  - All imputation (+ missingness indicator), scaling, OneHotEncoding, and SMOTE
    live inside `imblearn.pipeline.Pipeline` so nothing leaks into validation folds.
  - Stratified 5-fold CV evaluates Recall, ROC-AUC, F1, and Brier score across
    Dummy Baseline, uncalibrated Logistic Regression (SMOTE), and calibrated
    Logistic Regression / Random Forest / XGBoost (`CalibratedClassifierCV`).
  - Untouched 20% stratified test set computes final metrics + calibration curve bins.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any

from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    f1_score,
    fbeta_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, StratifiedShuffleSplit
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.health.features import (  # noqa: E402
    DIABETES_RAW_COLUMNS,
    HEART_CATEGORICAL_COLS,
    HEART_NUMERIC_COLS,
    HEART_RAW_COLUMNS,
    DiabetesClinicalCleaner,
    HeartClinicalFormatter,
)

DATA_DIR = REPO_ROOT / "data" / "health"
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "1.0.0"

MEDICAL_DISCLAIMER = (
    "Awareness and educational screening only — NOT a medical diagnosis, clinical "
    "decision, or substitute for professional medical advice. Consult a qualified "
    "healthcare professional for testing and diagnosis."
)


def _compute_binary_health_metrics(
    y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5
) -> dict[str, float]:
    y_pred = (y_prob >= threshold).astype(int)
    return {
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 4),
        "brier_score": round(float(brier_score_loss(y_true, y_prob)), 4),
    }


def _tune_screening_thresholds(y_true: np.ndarray, oof_prob: np.ndarray) -> tuple[float, float]:
    """Tune elevated-risk threshold on OOF probabilities maximizing F2 (recall-weighted)."""
    best_t_high = 0.45
    best_f2 = -1.0
    for thr in np.linspace(0.28, 0.70, 43):
        preds = (oof_prob >= thr).astype(int)
        score = fbeta_score(y_true, preds, beta=2.0, zero_division=0)
        if score > best_f2:
            best_f2 = score
            best_t_high = float(thr)

    t_low = max(0.12, round(best_t_high * 0.55, 4))
    t_high = round(best_t_high, 4)
    if t_low >= t_high:
        t_low = max(0.10, round(t_high - 0.12, 4))
    return t_low, t_high


def _build_calibration_curve_data(
    y_true: np.ndarray, y_prob: np.ndarray, n_bins: int = 8
) -> dict[str, Any]:
    prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="uniform")
    return {
        "n_bins": int(len(prob_true)),
        "mean_predicted_prob": [round(float(x), 4) for x in prob_pred],
        "fraction_of_positives": [round(float(x), 4) for x in prob_true],
    }


def _build_classification_error_analysis(
    X_test: pd.DataFrame,
    y_test: np.ndarray,
    y_prob: np.ndarray,
    t_low: float,
    t_high: float,
) -> dict[str, Any]:
    preds_high = (y_prob >= t_high).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, preds_high, labels=[0, 1]).ravel()

    preds_any_alert = (y_prob >= t_low).astype(int)
    missed_even_moderate = int(np.sum((y_test == 1) & (preds_any_alert == 0)))

    fn_mask = (y_test == 1) & (preds_high == 0)
    fp_mask = (y_test == 0) & (preds_high == 1)

    def _sample_rows(mask: np.ndarray, limit: int = 3) -> list[dict[str, Any]]:
        idxs = np.where(mask)[0][:limit]
        out = []
        for idx in idxs:
            row = X_test.iloc[idx].to_dict()
            clean_row = {
                k: (None if pd.isna(v) else round(float(v), 3) if isinstance(v, (float, np.floating)) else v)
                for k, v in row.items()
            }
            clean_row["risk_prob"] = round(float(y_prob[idx]), 4)
            out.append(clean_row)
        return out

    return {
        "confusion_matrix_at_t_high": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
        "missed_positives_even_below_moderate_band": missed_even_moderate,
        "false_negatives_sample": _sample_rows(fn_mask),
        "false_positives_sample": _sample_rows(fp_mask),
    }


def _evaluate_candidate_cv(
    name: str,
    estimator: Any,
    X: pd.DataFrame,
    y: np.ndarray,
    cv: StratifiedKFold,
) -> tuple[dict[str, Any], np.ndarray]:
    """Evaluate a candidate model across 5-fold stratified CV and return OOF probabilities."""
    oof_probs = np.zeros(len(y), dtype=np.float64)
    fold_metrics: list[dict[str, float]] = []

    for train_idx, val_idx in cv.split(X, y):
        model = clone(estimator)
        model.fit(X.iloc[train_idx], y[train_idx])
        probs = model.predict_proba(X.iloc[val_idx])[:, 1]
        oof_probs[val_idx] = probs
        fold_metrics.append(_compute_binary_health_metrics(y[val_idx], probs, threshold=0.5))

    summary = {
        "model": name,
        "cv_recall_mean": round(float(np.mean([m["recall"] for m in fold_metrics])), 4),
        "cv_recall_std": round(float(np.std([m["recall"] for m in fold_metrics])), 4),
        "cv_roc_auc_mean": round(float(np.mean([m["roc_auc"] for m in fold_metrics])), 4),
        "cv_roc_auc_std": round(float(np.std([m["roc_auc"] for m in fold_metrics])), 4),
        "cv_f1_mean": round(float(np.mean([m["f1"] for m in fold_metrics])), 4),
        "cv_brier_mean": round(float(np.mean([m["brier_score"] for m in fold_metrics])), 4),
        "cv_brier_std": round(float(np.std([m["brier_score"] for m in fold_metrics])), 4),
    }
    return summary, oof_probs


def _build_diabetes_preprocessor() -> ColumnTransformer:
    numeric_pipe = ImbPipeline(
        [
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
        ]
    )
    return ColumnTransformer(
        transformers=[("num", numeric_pipe, DIABETES_RAW_COLUMNS)],
        verbose_feature_names_out=True,
    )


def _build_heart_preprocessor() -> ColumnTransformer:
    numeric_pipe = ImbPipeline(
        [
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = ImbPipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "ohe",
                OneHotEncoder(
                    handle_unknown="infrequent_if_exist",
                    sparse_output=False,
                ),
            ),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, HEART_NUMERIC_COLS),
            ("cat", categorical_pipe, HEART_CATEGORICAL_COLS),
        ],
        verbose_feature_names_out=True,
    )


def _train_health_track(
    sub_model: str,
    df: pd.DataFrame,
    raw_cols: list[str],
    target_col: str,
    cleaner: Any,
    preprocessor_fn: Any,
    dataset_info: dict[str, Any],
    limitations: list[str],
    ui_options: dict[str, Any],
) -> dict[str, Any]:
    X = df[raw_cols].copy().reset_index(drop=True)
    y = df[target_col].to_numpy(dtype=int)

    splitter = StratifiedShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    train_idx, test_idx = next(splitter.split(X, y))
    X_train_val = X.iloc[train_idx].reset_index(drop=True)
    y_train_val = y[train_idx]
    X_test = X.iloc[test_idx].reset_index(drop=True)
    y_test = y[test_idx]

    outer_cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    def make_imb_pipe(clf: Any) -> ImbPipeline:
        return ImbPipeline(
            [
                ("clean", clone(cleaner)),
                ("preprocess", preprocessor_fn()),
                ("smote", SMOTE(random_state=42, k_neighbors=5)),
                ("clf", clf),
            ]
        )

    def make_calibrated(clf: Any, method: str = "sigmoid") -> CalibratedClassifierCV:
        # Calibrate inner SMOTE+Classifier pipeline probabilities against untouched validation folds
        inner_cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        return CalibratedClassifierCV(estimator=make_imb_pipe(clf), method=method, cv=inner_cv)

    lr_base = LogisticRegression(max_iter=1000, C=1.0, random_state=42)
    rf_base = RandomForestClassifier(
        n_estimators=250,
        max_depth=6,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
    )
    xgb_base = XGBClassifier(
        n_estimators=180,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=2.0,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )

    candidates: list[tuple[str, Any, bool]] = [
        ("Baseline: Dummy (Prior)", DummyClassifier(strategy="prior"), False),
        ("Logistic Regression (SMOTE, Uncalibrated)", make_imb_pipe(clone(lr_base)), False),
        ("Logistic Regression (SMOTE + Sigmoid Calibrated)", make_calibrated(lr_base, "sigmoid"), True),
        ("Random Forest (SMOTE + Sigmoid Calibrated)", make_calibrated(rf_base, "sigmoid"), True),
        ("XGBoost (SMOTE + Sigmoid Calibrated)", make_calibrated(xgb_base, "sigmoid"), True),
    ]

    comparison_table: list[dict[str, Any]] = []
    best_name = ""
    best_estimator: Any = None
    best_oof: np.ndarray | None = None
    best_score = -1.0

    for name, est, is_calibrated_candidate in candidates:
        summary, oof_probs = _evaluate_candidate_cv(name, est, X_train_val, y_train_val, outer_cv)
        comparison_table.append(summary)
        print(
            f"  CV {name:48s} | ROC-AUC={summary['cv_roc_auc_mean']:.4f} "
            f"| Recall={summary['cv_recall_mean']:.4f} | Brier={summary['cv_brier_mean']:.4f}"
        )
        # Select calibrated model combining strong discrimination (ROC-AUC) with low Brier penalty
        composite = summary["cv_roc_auc_mean"] - 0.5 * summary["cv_brier_mean"]
        if is_calibrated_candidate and composite > best_score:
            best_score = composite
            best_name = name
            best_estimator = clone(est)
            best_oof = oof_probs

    assert best_estimator is not None and best_oof is not None
    print(f"  Selected {sub_model} calibrated model: {best_name}")

    t_low, t_high = _tune_screening_thresholds(y_train_val, best_oof)

    # Fit on full train+val split; evaluate once on untouched 20% test split
    best_estimator.fit(X_train_val, y_train_val)
    test_probs = best_estimator.predict_proba(X_test)[:, 1]

    test_at_050 = _compute_binary_health_metrics(y_test, test_probs, threshold=0.50)
    test_at_tuned = _compute_binary_health_metrics(y_test, test_probs, threshold=t_high)
    alert_recall = float(recall_score(y_test, (test_probs >= t_low).astype(int), zero_division=0))

    # Extract uncalibrated SMOTE OOF curve vs calibrated test curve for transparency
    cal_curve_test = _build_calibration_curve_data(y_test, test_probs, n_bins=6)
    cal_curve_cv = _build_calibration_curve_data(y_train_val, best_oof, n_bins=8)

    error_analysis = _build_classification_error_analysis(X_test, y_test, test_probs, t_low, t_high)

    bundle_path = ARTIFACTS_DIR / f"{sub_model}_health_bundle.joblib"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": best_estimator,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "sub_model": sub_model,
        "threshold_low": t_low,
        "threshold_high": t_high,
        "raw_columns": raw_cols,
        "ui_options": ui_options,
        "disclaimer": MEDICAL_DISCLAIMER,
    }
    joblib.dump(bundle, bundle_path)

    return {
        "module": "health",
        "sub_model": sub_model,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "disclaimer": MEDICAL_DISCLAIMER,
        "dataset": dataset_info,
        "splits": {
            "train_val_rows": int(len(X_train_val)),
            "test_rows": int(len(X_test)),
            "test_positive_rate": round(float(y_test.mean()), 4),
        },
        "thresholds": {
            "moderate_risk_min": t_low,
            "elevated_risk_min": t_high,
        },
        "metrics": {
            "recall": test_at_tuned["recall"],
            "precision": test_at_tuned["precision"],
            "f1": test_at_tuned["f1"],
            "roc_auc": test_at_tuned["roc_auc"],
            "brier_score": test_at_tuned["brier_score"],
            "test_at_0_50": test_at_050,
            "test_at_tuned_elevated": test_at_tuned,
            "test_alert_recall_including_moderate": round(alert_recall, 4),
            "calibration_curve_cv_oof": cal_curve_cv,
            "calibration_curve_test": cal_curve_test,
        },
        "comparison_table": comparison_table,
        "error_analysis": error_analysis,
        "limitations": limitations,
        "artifact_path": str(bundle_path.relative_to(REPO_ROOT).as_posix()),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def train_diabetes_module(path: Path | None = None) -> dict[str, Any]:
    csv_path = path or (DATA_DIR / "diabetes.csv")
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing {csv_path}. Run `python ml/health/download_data.py` first.")

    raw_df = pd.read_csv(csv_path)
    dedup_df = raw_df.drop_duplicates().reset_index(drop=True)
    zero_counts = {
        col: int((dedup_df[col] <= 0).sum()) for col in ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]
    }
    print(
        f"\n[DIABETES] Loaded {len(dedup_df)} rows "
        f"(positive rate={dedup_df['Outcome'].mean():.2%}, zero-imputed cols={zero_counts})."
    )

    dataset_info = {
        "source_file": csv_path.name,
        "rows": int(len(dedup_df)),
        "positive_rate": round(float(dedup_df["Outcome"].mean()), 4),
        "biological_zeros_treated_as_nan": zero_counts,
    }

    limitations = [
        "Trained on the Pima Indians Diabetes cohort (768 female patients aged >= 21); population prevalence and demographics may not generalize uniformly.",
        "High missingness in Serum Insulin (48.7%) and Triceps Skin Thickness (29.6%), recorded as 0 in raw data, requires median imputation inside the pipeline.",
        "This risk probability supports preventive health awareness only — fasting lab confirmation (HbA1c / OGTT) by a doctor is essential.",
    ]

    ui_options = {
        "defaults": {
            "Pregnancies": 2,
            "Glucose": 115.0,
            "BloodPressure": 72.0,
            "SkinThickness": 25.0,
            "Insulin": 95.0,
            "BMI": 27.5,
            "DiabetesPedigreeFunction": 0.42,
            "Age": 34,
        }
    }

    return _train_health_track(
        sub_model="diabetes",
        df=dedup_df,
        raw_cols=DIABETES_RAW_COLUMNS,
        target_col="Outcome",
        cleaner=DiabetesClinicalCleaner(),
        preprocessor_fn=_build_diabetes_preprocessor,
        dataset_info=dataset_info,
        limitations=limitations,
        ui_options=ui_options,
    )


def train_heart_module(path: Path | None = None) -> dict[str, Any]:
    csv_path = path or (DATA_DIR / "heart_cleveland.csv")
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing {csv_path}. Run `python ml/health/download_data.py` first.")

    raw_df = pd.read_csv(csv_path)
    dedup_df = raw_df.drop_duplicates().reset_index(drop=True)
    missing_counts = {col: int(dedup_df[col].isna().sum()) for col in HEART_RAW_COLUMNS if dedup_df[col].isna().any()}
    print(
        f"\n[HEART] Loaded {len(dedup_df)} rows "
        f"(positive rate={dedup_df['target'].mean():.2%}, missing={missing_counts})."
    )

    dataset_info = {
        "source_file": csv_path.name,
        "rows": int(len(dedup_df)),
        "positive_rate": round(float(dedup_df["target"].mean()), 4),
        "missing_values_imputed_in_pipeline": missing_counts,
    }

    limitations = [
        "UCI Cleveland Heart Disease dataset contains 303 clinical records from diagnostic referrals (45.9% disease prevalence), higher than the general population.",
        "Includes hospital-derived indicators such as exercise ST depression (`oldpeak`), fluoroscopy vessels (`ca`), and thallium scan (`thal`) not available in routine home checkups.",
        "Output reflects calibrated statistical correlation in the cohort — awareness only, never a clinical cardiac clearance or diagnosis.",
    ]

    ui_options = {
        "cp_choices": [
            {"value": 1, "label": "1 - Typical Angina"},
            {"value": 2, "label": "2 - Atypical Angina"},
            {"value": 3, "label": "3 - Non-anginal Pain"},
            {"value": 4, "label": "4 - Asymptomatic"},
        ],
        "restecg_choices": [
            {"value": 0, "label": "0 - Normal"},
            {"value": 1, "label": "1 - ST-T Wave Abnormality"},
            {"value": 2, "label": "2 - Left Ventricular Hypertrophy"},
        ],
        "slope_choices": [
            {"value": 1, "label": "1 - Upsloping"},
            {"value": 2, "label": "2 - Flat"},
            {"value": 3, "label": "3 - Downsloping"},
        ],
        "thal_choices": [
            {"value": 3, "label": "3 - Normal"},
            {"value": 6, "label": "6 - Fixed Defect"},
            {"value": 7, "label": "7 - Reversible Defect"},
        ],
    }

    return _train_health_track(
        sub_model="heart",
        df=dedup_df,
        raw_cols=HEART_RAW_COLUMNS,
        target_col="target",
        cleaner=HeartClinicalFormatter(),
        preprocessor_fn=_build_heart_preprocessor,
        dataset_info=dataset_info,
        limitations=limitations,
        ui_options=ui_options,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train calibrated Health Check screening models.")
    parser.add_argument("--diabetes-path", type=Path, default=None)
    parser.add_argument("--heart-path", type=Path, default=None)
    args = parser.parse_args()

    diabetes_meta = train_diabetes_module(args.diabetes_path)
    heart_meta = train_heart_module(args.heart_path)

    metadata_path = ARTIFACTS_DIR / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump([diabetes_meta, heart_meta], fh, indent=2)

    print(f"\nSaved Health Check artifacts and metadata to {ARTIFACTS_DIR}")


if __name__ == "__main__":
    main()
