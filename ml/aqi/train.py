"""Leakage-safe chronological training pipeline for LifeGuard AI Module 4: Air Aware.

Trains and evaluates two next-day (t -> t+1) AQI forecasting pipelines:
  1. Next-Day AQI Value Regression (`next_day_aqi`) comparing:
     Persistence Baseline, Ridge Baseline, Random Forest, XGBoost, LightGBM
  2. Next-Day AQI Category Classification (`next_day_category`) comparing:
     Persistence Baseline, Balanced Logistic Regression, Random Forest, XGBoost, LightGBM,
     and SMOTE-resampled Classifier inside imblearn.pipeline.Pipeline.

Strict Time-Series Guarantees:
  - NO random splitting or shuffling anywhere.
  - All lag/rolling features use strictly backward indices (<= t) within each station.
  - Last 20% of calendar dates are held out untouched as final chronological test set.
  - Within train+val dates, expanding date-grouped chronological folds (`n_splits=4`) ensure
    every validation block lies strictly in the future of its training block.
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
from lightgbm import LGBMClassifier, LGBMRegressor
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    f1_score,
    fbeta_score,
    mean_absolute_error,
    r2_score,
    recall_score,
    root_mean_squared_error,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier, XGBRegressor

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.aqi.features import (  # noqa: E402
    AQI_CATEGORIES,
    AQI_CATEGORICAL_FEATURES,
    AQI_NUMERIC_FEATURES,
    AQI_RAW_COLUMNS,
    CATEGORY_TO_INT,
    INT_TO_CATEGORY,
    AqiFeatureExtractor,
    build_causal_station_history,
)

DATA_DIR = REPO_ROOT / "data" / "aqi"
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "2.0.0"

UNHEALTHY_CLASSES = [CATEGORY_TO_INT[c] for c in ("Poor", "Very Poor", "Severe")]


def _make_date_expanding_splits(dates: pd.Series, n_splits: int = 4) -> list[tuple[np.ndarray, np.ndarray]]:
    """Create expanding chronological folds grouped by unique sorted calendar dates."""
    unique_dates = np.array(sorted(dates.unique()))
    # Reserve first 36% of dates as initial warm-up so all seasonal AQI buckets exist in fold 1
    chunks = np.array_split(unique_dates, n_splits + 2)
    splits: list[tuple[np.ndarray, np.ndarray]] = []
    for k in range(2, len(chunks)):
        train_dates = set(np.concatenate(chunks[:k]))
        val_dates = set(chunks[k])
        tr_idx = np.where(dates.isin(train_dates))[0]
        va_idx = np.where(dates.isin(val_dates))[0]
        splits.append((tr_idx, va_idx))
    return splits


def _build_preprocessor() -> ColumnTransformer:
    numeric_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
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
            ("num", numeric_pipe, AQI_NUMERIC_FEATURES),
            ("cat", categorical_pipe, AQI_CATEGORICAL_FEATURES),
        ],
        verbose_feature_names_out=True,
    )


def _compute_regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "rmse": round(float(root_mean_squared_error(y_true, y_pred)), 2),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
    }


def _compute_classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    unhealthy_prob: np.ndarray,
    unhealthy_thr: float = 0.50,
) -> dict[str, float]:
    y_unhealthy_true = np.isin(y_true, UNHEALTHY_CLASSES).astype(int)
    y_unhealthy_pred = (unhealthy_prob >= unhealthy_thr).astype(int)
    adjacent_acc = float(np.mean(np.abs(y_true - y_pred) <= 1))
    return {
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "weighted_f1": round(float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 4),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "adjacent_1_accuracy": round(adjacent_acc, 4),
        "unhealthy_recall": round(float(recall_score(y_unhealthy_true, y_unhealthy_pred, zero_division=0)), 4),
        "unhealthy_pr_auc": round(float(average_precision_score(y_unhealthy_true, unhealthy_prob)), 4),
    }


def _raw_feature_columns(df: pd.DataFrame) -> list[str]:
    return AQI_RAW_COLUMNS + [c for c in ("state", "latitude", "longitude") if c in df.columns]


def _build_india_ui_options(
    train_val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    test_preds: np.ndarray,
) -> dict[str, Any]:
    """Assemble All-India UI catalog (36 States/UTs, 545+ stations, presets, and future test timelines)."""
    india_meta_path = DATA_DIR / "india_stations.json"
    states_list: list[dict[str, Any]] = []
    stations_directory: list[dict[str, Any]] = []
    stations: list[str] = sorted(train_val_df["station"].unique().tolist())

    if india_meta_path.exists():
        meta = json.loads(india_meta_path.read_text(encoding="utf-8"))
        states_list = meta.get("states", [])
        stations_directory = meta.get("stations", [])
        if stations_directory:
            stations = sorted({str(rec["station"]) for rec in stations_directory})

    # Per-state future test timelines (latest 45 test days of each state's primary anchor station)
    state_timelines: dict[str, dict[str, Any]] = {}
    if "state" in test_df.columns:
        for state_name in sorted(test_df["state"].dropna().unique().tolist()):
            st_sub = test_df[test_df["state"] == state_name]
            anchor_station = str(st_sub["station"].value_counts().idxmax())
            mask = (test_df["state"] == state_name) & (test_df["station"] == anchor_station)
            sub_df = test_df[mask].tail(45)
            sub_preds = test_preds[mask.to_numpy()][-len(sub_df) :]
            city_val = str(sub_df["city"].iloc[0]) if "city" in sub_df.columns and not sub_df.empty else ""
            state_timelines[str(state_name)] = {
                "state": str(state_name),
                "city": city_val,
                "station": anchor_station,
                "dates": sub_df["date"].tolist(),
                "actual_next_day_aqi": [round(float(v), 1) for v in sub_df["next_day_aqi"]],
                "predicted_next_day_aqi": [round(float(v), 1) for v in sub_preds],
            }

    # Default timeline sample: Delhi flagship station if present, else largest test station
    if "Delhi" in state_timelines:
        timeline_sample = state_timelines["Delhi"]
    elif state_timelines:
        first_state = next(iter(state_timelines))
        timeline_sample = state_timelines[first_state]
    else:
        top_station = str(test_df["station"].value_counts().idxmax())
        mask = test_df["station"] == top_station
        sub_df = test_df[mask].tail(45)
        sub_preds = test_preds[mask.to_numpy()][-len(sub_df) :]
        timeline_sample = {
            "station": top_station,
            "dates": sub_df["date"].tolist(),
            "actual_next_day_aqi": [round(float(v), 1) for v in sub_df["next_day_aqi"]],
            "predicted_next_day_aqi": [round(float(v), 1) for v in sub_preds],
        }

    # Curated presets from recent test snapshots across distinct Indian states/cities
    presets: dict[str, dict[str, Any]] = {}
    preferred_cities = [
        ("Delhi", "Delhi"),
        ("Maharashtra", "Mumbai"),
        ("Karnataka", "Bengaluru"),
        ("Kerala", "Thiruvananthapuram"),
    ]
    for st_name, c_name in preferred_cities:
        if "state" in test_df.columns and "city" in test_df.columns:
            sub = test_df[(test_df["state"] == st_name) & (test_df["city"] == c_name)]
        elif "state" in test_df.columns:
            sub = test_df[test_df["state"] == st_name]
        else:
            sub = pd.DataFrame()
        if not sub.empty:
            r = sub.tail(1).iloc[0]
            label = f"{c_name}, {st_name}"
            presets[label] = {
                col: (
                    None
                    if pd.isna(r[col])
                    else round(float(r[col]), 2)
                    if isinstance(r[col], (float, np.floating, int, np.integer))
                    else str(r[col])
                )
                for col in AQI_RAW_COLUMNS
            }
            presets[label]["state"] = st_name

    if not presets:
        for st in sorted(test_df["station"].unique())[:3]:
            r = test_df[test_df["station"] == st].tail(1).iloc[0]
            presets[st] = {
                col: (
                    None
                    if pd.isna(r[col])
                    else round(float(r[col]), 2)
                    if isinstance(r[col], (float, np.floating, int, np.integer))
                    else str(r[col])
                )
                for col in AQI_RAW_COLUMNS
            }

    return {
        "country": "India",
        "states": states_list,
        "stations": stations,
        "stations_directory": stations_directory,
        "categories": AQI_CATEGORIES,
        "presets": presets,
        "timeline_sample": timeline_sample,
        "state_timelines": state_timelines,
    }


def _train_regression_track(
    train_val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    splits: list[tuple[np.ndarray, np.ndarray]],
    dataset_info: dict[str, Any],
    split_info: dict[str, Any],
) -> dict[str, Any]:
    raw_cols = _raw_feature_columns(train_val_df)
    X_tr = train_val_df[raw_cols].copy()
    y_tr = train_val_df["next_day_aqi"].to_numpy(dtype=np.float64)
    X_te = test_df[raw_cols].copy()
    y_te = test_df["next_day_aqi"].to_numpy(dtype=np.float64)

    def make_pipe(reg: Any) -> Pipeline:
        return Pipeline(
            [
                ("extract", AqiFeatureExtractor()),
                ("preprocess", _build_preprocessor()),
                ("reg", reg),
            ]
        )

    print("\n[AQI REGRESSION] Evaluating chronological expanding TimeSeriesSplit CV...")
    comparison_table: list[dict[str, Any]] = []

    # Persistence Baseline: tomorrow's AQI == today's AQI
    pers_metrics = [
        _compute_regression_metrics(y_tr[va], X_tr.iloc[va]["AQI"].to_numpy(dtype=np.float64))
        for _, va in splits
    ]
    comparison_table.append(
        {
            "model": "Baseline: Persistence (t+1 = t)",
            "cv_mae_mean": round(float(np.mean([m["mae"] for m in pers_metrics])), 2),
            "cv_mae_std": round(float(np.std([m["mae"] for m in pers_metrics])), 2),
            "cv_rmse_mean": round(float(np.mean([m["rmse"] for m in pers_metrics])), 2),
            "cv_rmse_std": round(float(np.std([m["rmse"] for m in pers_metrics])), 2),
            "cv_r2_mean": round(float(np.mean([m["r2"] for m in pers_metrics])), 4),
            "cv_r2_std": round(float(np.std([m["r2"] for m in pers_metrics])), 4),
        }
    )
    print(
        f"  CV Baseline: Persistence        | MAE={comparison_table[0]['cv_mae_mean']:6.2f} "
        f"| RMSE={comparison_table[0]['cv_rmse_mean']:6.2f} | R2={comparison_table[0]['cv_r2_mean']:.4f}"
    )

    candidates: list[tuple[str, Pipeline]] = [
        ("Ridge Regression (Baseline)", make_pipe(Ridge(alpha=15.0, random_state=42))),
        (
            "Random Forest Regressor",
            make_pipe(
                RandomForestRegressor(
                    n_estimators=220, max_depth=14, min_samples_leaf=4, random_state=42, n_jobs=-1
                )
            ),
        ),
        (
            "XGBoost Regressor",
            make_pipe(
                XGBRegressor(
                    n_estimators=300,
                    max_depth=5,
                    learning_rate=0.05,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    reg_lambda=2.0,
                    random_state=42,
                    n_jobs=-1,
                )
            ),
        ),
        (
            "LightGBM Regressor",
            make_pipe(
                LGBMRegressor(
                    n_estimators=300,
                    learning_rate=0.05,
                    num_leaves=31,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    random_state=42,
                    n_jobs=-1,
                    verbose=-1,
                )
            ),
        ),
    ]

    best_name = ""
    best_pipe: Pipeline | None = None
    best_mae = float("inf")

    for name, pipe in candidates:
        fold_metrics = []
        for tr_idx, va_idx in splits:
            m_pipe = clone(pipe)
            m_pipe.fit(X_tr.iloc[tr_idx], y_tr[tr_idx])
            preds = np.clip(m_pipe.predict(X_tr.iloc[va_idx]), 0.0, 500.0)
            fold_metrics.append(_compute_regression_metrics(y_tr[va_idx], preds))

        row = {
            "model": name,
            "cv_mae_mean": round(float(np.mean([m["mae"] for m in fold_metrics])), 2),
            "cv_mae_std": round(float(np.std([m["mae"] for m in fold_metrics])), 2),
            "cv_rmse_mean": round(float(np.mean([m["rmse"] for m in fold_metrics])), 2),
            "cv_rmse_std": round(float(np.std([m["rmse"] for m in fold_metrics])), 2),
            "cv_r2_mean": round(float(np.mean([m["r2"] for m in fold_metrics])), 4),
            "cv_r2_std": round(float(np.std([m["r2"] for m in fold_metrics])), 4),
        }
        comparison_table.append(row)
        print(
            f"  CV {name:28s} | MAE={row['cv_mae_mean']:6.2f} "
            f"| RMSE={row['cv_rmse_mean']:6.2f} | R2={row['cv_r2_mean']:.4f}"
        )
        if row["cv_mae_mean"] < best_mae:
            best_mae = row["cv_mae_mean"]
            best_name = name
            best_pipe = clone(pipe)

    assert best_pipe is not None
    print(f"  Selected AQI regressor (lowest CV MAE): {best_name}")
    best_pipe.fit(X_tr, y_tr)

    test_preds = np.clip(best_pipe.predict(X_te), 0.0, 500.0)
    test_metrics = _compute_regression_metrics(y_te, test_preds)

    # Error analysis by season and worst residual spikes
    abs_err = np.abs(y_te - test_preds)
    test_months = pd.to_datetime(test_df["date"]).dt.month
    winter_mask = test_months.isin([11, 12, 1, 2])
    seasonal_mae = {
        "winter_haze_months_nov_feb": {
            "count": int(winter_mask.sum()),
            "mae": round(float(np.mean(abs_err[winter_mask])), 2) if winter_mask.any() else None,
        },
        "non_winter_months": {
            "count": int((~winter_mask).sum()),
            "mae": round(float(np.mean(abs_err[~winter_mask])), 2) if (~winter_mask).any() else None,
        },
    }

    worst_idx = np.argsort(-abs_err)[:5]
    worst_samples = [
        {
            "station": str(test_df.iloc[i]["station"]),
            "date": str(test_df.iloc[i]["date"]),
            "today_aqi": round(float(test_df.iloc[i]["AQI"]), 1),
            "actual_next_aqi": round(float(y_te[i]), 1),
            "predicted_next_aqi": round(float(test_preds[i]), 1),
            "abs_error": round(float(abs_err[i]), 1),
        }
        for i in worst_idx
    ]

    ui_options = _build_india_ui_options(train_val_df, test_df, test_preds)
    total_states = int(dataset_info.get("states_and_uts", 36))
    total_catalog_stations = len(ui_options["stations"])

    bundle_path = ARTIFACTS_DIR / "aqi_regressor_bundle.joblib"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": best_pipe,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "sub_model": "regressor",
        "test_mae": test_metrics["mae"],
        "ui_options": ui_options,
    }
    joblib.dump(bundle, bundle_path)

    return {
        "module": "aqi",
        "sub_model": "regressor",
        "model_name": best_name,
        "version": MODEL_VERSION,
        "dataset": dataset_info,
        "splits": split_info,
        "thresholds": {"uncertainty_band_mae": test_metrics["mae"]},
        "metrics": test_metrics,
        "comparison_table": comparison_table,
        "error_analysis": {
            "seasonal_mae": seasonal_mae,
            "median_abs_error": round(float(np.median(abs_err)), 2),
            "worst_spikes_sample": worst_samples,
        },
        "limitations": [
            f"Trained on {dataset_info['date_range']} multi-year daily Copernicus CAMS air quality + ERA5 meteorology across {dataset_info['stations']} anchor stations in all {total_states} Indian States & Union Territories, generalized to {total_catalog_stations} CPCB/SPCB stations via State and geographic coordinates.",
            "Sudden local emission spikes (stubble burning, festival fireworks, dust storms, thermal inversions) create larger winter-haze residuals.",
            "Reanalysis/satellite-assimilated concentrations reflect regional grid airsheds; micro-scale roadside hotspots can read higher on localized CPCB monitors.",
        ],
        "artifact_path": str(bundle_path.relative_to(REPO_ROOT).as_posix()),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def _train_classification_track(
    train_val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    splits: list[tuple[np.ndarray, np.ndarray]],
    dataset_info: dict[str, Any],
    split_info: dict[str, Any],
) -> dict[str, Any]:
    raw_cols = _raw_feature_columns(train_val_df)
    X_tr = train_val_df[raw_cols].copy()
    y_tr = train_val_df["next_day_category"].map(CATEGORY_TO_INT).to_numpy(dtype=int)
    X_te = test_df[raw_cols].copy()
    y_te = test_df["next_day_category"].map(CATEGORY_TO_INT).to_numpy(dtype=int)

    _, counts = np.unique(y_tr, return_counts=True)
    smote_k = min(3, max(1, int(counts.min()) - 1)) if len(counts) > 0 else 1

    def make_pipe(clf: Any, use_smote: bool = False) -> ImbPipeline:
        steps: list[tuple[str, Any]] = [
            ("extract", AqiFeatureExtractor()),
            ("preprocess", _build_preprocessor()),
        ]
        if use_smote and smote_k >= 1:
            steps.append(("smote", SMOTE(random_state=42, k_neighbors=smote_k)))
        steps.append(("clf", clf))
        return ImbPipeline(steps)

    print("\n[AQI CLASSIFICATION] Evaluating chronological expanding TimeSeriesSplit CV...")
    comparison_table: list[dict[str, Any]] = []

    # Persistence Category Baseline: tomorrow's category == today's category
    pers_today_cat = train_val_df["AQI_Category"].map(CATEGORY_TO_INT).to_numpy(dtype=int)
    pers_folds = []
    for _, va_idx in splits:
        pers_pred = pers_today_cat[va_idx]
        pers_unhealthy_prob = np.isin(pers_pred, UNHEALTHY_CLASSES).astype(np.float64)
        pers_folds.append(_compute_classification_metrics(y_tr[va_idx], pers_pred, pers_unhealthy_prob))

    comparison_table.append(
        {
            "model": "Baseline: Persistence Category",
            "cv_macro_f1_mean": round(float(np.mean([m["macro_f1"] for m in pers_folds])), 4),
            "cv_macro_f1_std": round(float(np.std([m["macro_f1"] for m in pers_folds])), 4),
            "cv_weighted_f1_mean": round(float(np.mean([m["weighted_f1"] for m in pers_folds])), 4),
            "cv_accuracy_mean": round(float(np.mean([m["accuracy"] for m in pers_folds])), 4),
            "cv_adjacent_acc_mean": round(float(np.mean([m["adjacent_1_accuracy"] for m in pers_folds])), 4),
            "cv_unhealthy_recall_mean": round(float(np.mean([m["unhealthy_recall"] for m in pers_folds])), 4),
        }
    )
    print(
        f"  CV Baseline: Persistence        | Macro-F1={comparison_table[0]['cv_macro_f1_mean']:.4f} "
        f"| W-F1={comparison_table[0]['cv_weighted_f1_mean']:.4f} | Adj1-Acc={comparison_table[0]['cv_adjacent_acc_mean']:.4f}"
    )

    candidates: list[tuple[str, ImbPipeline]] = [
        (
            "Logistic Regression (Balanced)",
            make_pipe(LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced", random_state=42)),
        ),
        (
            "Logistic Regression (SMOTE)",
            make_pipe(LogisticRegression(max_iter=1000, C=1.0, random_state=42), use_smote=True),
        ),
        (
            "Random Forest Classifier",
            make_pipe(
                RandomForestClassifier(
                    n_estimators=220,
                    max_depth=14,
                    min_samples_leaf=3,
                    class_weight="balanced",
                    random_state=42,
                    n_jobs=-1,
                )
            ),
        ),
        (
            "XGBoost Classifier",
            make_pipe(
                XGBClassifier(
                    n_estimators=260,
                    max_depth=5,
                    learning_rate=0.05,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    eval_metric="mlogloss",
                    random_state=42,
                    n_jobs=-1,
                )
            ),
        ),
        (
            "LightGBM Classifier",
            make_pipe(
                LGBMClassifier(
                    n_estimators=260,
                    learning_rate=0.05,
                    num_leaves=31,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    class_weight="balanced",
                    random_state=42,
                    n_jobs=-1,
                    verbose=-1,
                )
            ),
        ),
    ]

    best_name = ""
    best_pipe: ImbPipeline | None = None
    best_oof_unhealthy: np.ndarray | None = None
    best_y_oof: np.ndarray | None = None
    best_score = -1.0

    for name, pipe in candidates:
        fold_metrics = []
        oof_unhealthy_parts = []
        oof_y_parts = []
        for tr_idx, va_idx in splits:
            m_pipe = clone(pipe)
            m_pipe.fit(X_tr.iloc[tr_idx], y_tr[tr_idx])
            probs = m_pipe.predict_proba(X_tr.iloc[va_idx])
            preds = np.argmax(probs, axis=1)
            unhealthy_prob = np.sum(probs[:, UNHEALTHY_CLASSES], axis=1)

            fold_metrics.append(_compute_classification_metrics(y_tr[va_idx], preds, unhealthy_prob))
            oof_unhealthy_parts.append(unhealthy_prob)
            oof_y_parts.append(y_tr[va_idx])

        row = {
            "model": name,
            "cv_macro_f1_mean": round(float(np.mean([m["macro_f1"] for m in fold_metrics])), 4),
            "cv_macro_f1_std": round(float(np.std([m["macro_f1"] for m in fold_metrics])), 4),
            "cv_weighted_f1_mean": round(float(np.mean([m["weighted_f1"] for m in fold_metrics])), 4),
            "cv_accuracy_mean": round(float(np.mean([m["accuracy"] for m in fold_metrics])), 4),
            "cv_adjacent_acc_mean": round(float(np.mean([m["adjacent_1_accuracy"] for m in fold_metrics])), 4),
            "cv_unhealthy_recall_mean": round(float(np.mean([m["unhealthy_recall"] for m in fold_metrics])), 4),
        }
        comparison_table.append(row)
        print(
            f"  CV {name:28s} | Macro-F1={row['cv_macro_f1_mean']:.4f} "
            f"| W-F1={row['cv_weighted_f1_mean']:.4f} | Adj1-Acc={row['cv_adjacent_acc_mean']:.4f}"
        )

        # Balance overall Weighted-F1 and rare-class Macro-F1
        composite = 0.6 * row["cv_weighted_f1_mean"] + 0.4 * row["cv_macro_f1_mean"]
        if composite > best_score:
            best_score = composite
            best_name = name
            best_pipe = clone(pipe)
            best_oof_unhealthy = np.concatenate(oof_unhealthy_parts)
            best_y_oof = np.concatenate(oof_y_parts)

    assert best_pipe is not None and best_oof_unhealthy is not None and best_y_oof is not None
    print(f"  Selected AQI classifier: {best_name}")

    # Tune Unhealthy-Alert (Poor / Very Poor / Severe) probability threshold via F2 on OOF folds
    y_oof_unhealthy_true = np.isin(best_y_oof, UNHEALTHY_CLASSES).astype(int)
    best_thr = 0.45
    best_f2 = -1.0
    for thr in np.linspace(0.25, 0.70, 46):
        f2 = fbeta_score(y_oof_unhealthy_true, (best_oof_unhealthy >= thr).astype(int), beta=2.0, zero_division=0)
        if f2 > best_f2:
            best_f2 = f2
            best_thr = round(float(thr), 4)

    best_pipe.fit(X_tr, y_tr)
    test_probs = best_pipe.predict_proba(X_te)
    test_preds = np.argmax(test_probs, axis=1)
    test_unhealthy_prob = np.sum(test_probs[:, UNHEALTHY_CLASSES], axis=1)
    test_metrics = _compute_classification_metrics(y_te, test_preds, test_unhealthy_prob, unhealthy_thr=best_thr)

    per_class = classification_report(
        y_te,
        test_preds,
        labels=list(range(len(AQI_CATEGORIES))),
        target_names=AQI_CATEGORIES,
        output_dict=True,
        zero_division=0,
    )
    per_class_f1 = {cat: round(float(per_class[cat]["f1-score"]), 4) for cat in AQI_CATEGORIES}

    bundle_path = ARTIFACTS_DIR / "aqi_classifier_bundle.joblib"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": best_pipe,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "sub_model": "classifier",
        "categories": AQI_CATEGORIES,
        "unhealthy_alert_threshold": best_thr,
    }
    joblib.dump(bundle, bundle_path)

    test_cat_counts = {
        cat: int((y_te == CATEGORY_TO_INT[cat]).sum())
        for cat in AQI_CATEGORIES
    }
    rarest_cat = min(test_cat_counts, key=test_cat_counts.get)

    return {
        "module": "aqi",
        "sub_model": "classifier",
        "model_name": best_name,
        "version": MODEL_VERSION,
        "dataset": dataset_info,
        "splits": split_info,
        "thresholds": {"unhealthy_alert_min": best_thr},
        "metrics": test_metrics,
        "comparison_table": comparison_table,
        "error_analysis": {
            "per_class_f1": per_class_f1,
            "test_class_counts": test_cat_counts,
            "adjacent_1_accuracy": test_metrics["adjacent_1_accuracy"],
            "note": (
                f"Rare extremes ({rarest_cat}={test_cat_counts[rarest_cat]} test rows) have lower F1 due to sharp AQI bucket boundaries, "
                "while adjacent-1 category accuracy remains high."
            ),
        },
        "limitations": [
            f"6-class CPCB category distribution across {dataset_info.get('states_and_uts', 36)} Indian States/UTs is imbalanced toward Satisfactory/Moderate days, reducing exact rare-class boundary F1.",
            "Boundary discretization around fixed AQI cutoffs (50, 100, 200, 300, 400) causes minor 1-tier label shifts; inspect numeric AQI alongside category.",
            f"Chronological generalization evaluated on unseen future window ({split_info['test_dates']}); seasonal monsoon/stubble shifts warrant periodic retraining.",
        ],
        "artifact_path": str(bundle_path.relative_to(REPO_ROOT).as_posix()),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train chronological Air Aware next-day AQI models.")
    parser.add_argument("--data-path", type=Path, default=None)
    args = parser.parse_args()

    csv_path = args.data_path or (DATA_DIR / "daily_air_quality.csv")
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing {csv_path}. Run `python ml/aqi/download_data.py` first.")

    raw_df = pd.read_csv(csv_path)
    supervised_df = build_causal_station_history(raw_df)

    # Strictly chronological 80/20 split by unique sorted calendar dates (NO random split)
    unique_dates = sorted(supervised_df["date"].unique())
    split_date = unique_dates[int(len(unique_dates) * 0.80)]
    train_val_df = supervised_df[supervised_df["date"] < split_date].reset_index(drop=True)
    test_df = supervised_df[supervised_df["date"] >= split_date].reset_index(drop=True)

    splits = _make_date_expanding_splits(train_val_df["date"], n_splits=4)

    states_count = int(supervised_df["state"].nunique()) if "state" in supervised_df.columns else 1
    dataset_info = {
        "source_file": csv_path.name,
        "consecutive_day_pairs": int(len(supervised_df)),
        "stations": int(supervised_df["station"].nunique()),
        "states_and_uts": states_count,
        "date_range": f"{supervised_df['date'].min()} -> {supervised_df['date'].max()}",
    }
    split_info = {
        "split_method": "strict_chronological_by_date",
        "train_val_rows": int(len(train_val_df)),
        "train_val_dates": f"{train_val_df['date'].min()} -> {train_val_df['date'].max()}",
        "test_rows": int(len(test_df)),
        "test_dates": f"{test_df['date'].min()} -> {test_df['date'].max()}",
    }

    print(
        f"[AIR AWARE] Loaded {len(supervised_df):,} consecutive (t -> t+1) pairs across "
        f"{dataset_info['stations']} stations / {states_count} States & UTs | "
        f"Train+Val: {split_info['train_val_dates']} ({len(train_val_df):,}) | "
        f"Untouched Future Test: {split_info['test_dates']} ({len(test_df):,})"
    )

    reg_meta = _train_regression_track(train_val_df, test_df, splits, dataset_info, split_info)
    cls_meta = _train_classification_track(train_val_df, test_df, splits, dataset_info, split_info)

    metadata_path = ARTIFACTS_DIR / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump([reg_meta, cls_meta], fh, indent=2)

    print(f"\nSaved Air Aware artifacts and metadata to {ARTIFACTS_DIR}")


if __name__ == "__main__":
    main()
