"""Leakage-safe training pipeline for LifeGuard AI Module 2: Fair Price.

Trains and compares regression models for two vehicle tracks:
  1. Used Cars (`car_details.csv`): Ridge baseline, Random Forest, XGBoost, LightGBM
  2. Used Bikes (`bike_details.csv`): Ridge baseline, Random Forest, XGBoost, LightGBM

Strict ML guarantees:
  - Exact duplicate listings are removed BEFORE splitting.
  - 20% test split (stratified by binned price quantiles) is untouched until final evaluation.
  - All imputation (with missingness indicators), scaling, and OneHotEncoding live
    inside ColumnTransformer inside sklearn Pipeline.
  - Models are evaluated on MAE, RMSE, and R2 via 5-fold CV and on the untouched test set.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any

import joblib
from lightgbm import LGBMRegressor
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import KFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.price.features import (  # noqa: E402
    BIKE_RAW_COLUMNS,
    CAR_RAW_COLUMNS,
    BikeFeatureExtractor,
    CarFeatureExtractor,
)

DATA_DIR = REPO_ROOT / "data" / "price"
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "1.0.0"


def _compute_regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """Compute MAE, RMSE, and R2 in INR."""
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "rmse": round(float(root_mean_squared_error(y_true, y_pred)), 2),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
    }


def _evaluate_regression_cv(
    name: str,
    pipeline: Pipeline,
    X: pd.DataFrame,
    y: np.ndarray,
    splits: list[tuple[np.ndarray, np.ndarray]],
) -> dict[str, Any]:
    """Evaluate a regression Pipeline via 5-fold CV without fold leakage."""
    fold_metrics: list[dict[str, float]] = []
    for train_idx, val_idx in splits:
        X_tr = X.iloc[train_idx]
        y_tr = y[train_idx]
        X_va = X.iloc[val_idx]
        y_va = y[val_idx]

        pipeline.fit(X_tr, y_tr)
        preds = np.maximum(0.0, pipeline.predict(X_va))
        fold_metrics.append(_compute_regression_metrics(y_va, preds))

    return {
        "model": name,
        "cv_mae_mean": round(float(np.mean([m["mae"] for m in fold_metrics])), 2),
        "cv_mae_std": round(float(np.std([m["mae"] for m in fold_metrics])), 2),
        "cv_rmse_mean": round(float(np.mean([m["rmse"] for m in fold_metrics])), 2),
        "cv_rmse_std": round(float(np.std([m["rmse"] for m in fold_metrics])), 2),
        "cv_r2_mean": round(float(np.mean([m["r2"] for m in fold_metrics])), 4),
        "cv_r2_std": round(float(np.std([m["r2"] for m in fold_metrics])), 4),
    }


def _build_regression_error_analysis(
    X_test: pd.DataFrame, y_test: np.ndarray, y_pred: np.ndarray
) -> dict[str, Any]:
    """Inspect largest residual errors and MAE stratified by price bracket."""
    abs_err = np.abs(y_test - y_pred)
    signed_err = y_pred - y_test  # positive = overpredicted, negative = underpredicted

    # Stratify errors across price tiers so users see where the model is tighter/looser
    tertiles = np.quantile(y_test, [0.33, 0.67])
    tier_stats = []
    masks = [
        ("Budget", y_test <= tertiles[0]),
        ("Mid-range", (y_test > tertiles[0]) & (y_test <= tertiles[1])),
        ("Premium", y_test > tertiles[1]),
    ]
    for label, mask in masks:
        if np.any(mask):
            tier_stats.append(
                {
                    "tier": label,
                    "count": int(np.sum(mask)),
                    "mae_inr": round(float(np.mean(abs_err[mask])), 2),
                }
            )

    worst_idx = np.argsort(-abs_err)[:5]
    worst_examples = [
        {
            "name": str(X_test.iloc[i]["name"]),
            "year": int(X_test.iloc[i]["year"]),
            "actual_inr": round(float(y_test[i]), 2),
            "predicted_inr": round(float(y_pred[i]), 2),
            "error_inr": round(float(signed_err[i]), 2),
        }
        for i in worst_idx
    ]

    return {
        "tier_mae": tier_stats,
        "median_abs_error_inr": round(float(np.median(abs_err)), 2),
        "worst_residuals_sample": worst_examples,
    }


def _load_vehicle_csv(path: Path, required_cols: list[str], target_col: str = "selling_price") -> tuple[pd.DataFrame, dict[str, Any]]:
    raw_df = pd.read_csv(path)
    raw_rows = len(raw_df)

    missing_cols = set(required_cols + [target_col]) - set(raw_df.columns)
    if missing_cols:
        raise ValueError(f"Missing expected columns {missing_cols} in {path.name}")

    df = raw_df.dropna(subset=["name", "year", "km_driven", target_col]).copy()
    df = df[df[target_col] > 0]
    dedup_df = df.drop_duplicates().reset_index(drop=True)

    info = {
        "source_file": path.name,
        "raw_rows": int(raw_rows),
        "deduplicated_rows": int(len(dedup_df)),
        "duplicates_removed": int(raw_rows - len(dedup_df)),
        "median_price_inr": round(float(dedup_df[target_col].median()), 2),
    }
    return dedup_df, info


def _build_preprocessor(numeric_cols: list[str], categorical_cols: list[str]) -> ColumnTransformer:
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
                    min_frequency=5,
                    sparse_output=False,
                ),
            ),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, numeric_cols),
            ("cat", categorical_pipe, categorical_cols),
        ],
        verbose_feature_names_out=True,
    )


def _train_vehicle_track(
    sub_model: str,
    df: pd.DataFrame,
    data_info: dict[str, Any],
    raw_cols: list[str],
    extractor: Any,
    numeric_cols: list[str],
    categorical_cols: list[str],
    limitations: list[str],
    extra_ui_options: dict[str, Any],
) -> dict[str, Any]:
    X = df[raw_cols].copy()
    y = df["selling_price"].to_numpy(dtype=np.float64)

    # Stratify the 80/20 split using binned price quantiles so luxury & budget tiers are balanced
    price_bins = pd.qcut(y, q=5, labels=False, duplicates="drop")
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X, y, test_size=0.20, stratify=price_bins, random_state=42
    )
    X_train_val = X_train_val.reset_index(drop=True)
    X_test = X_test.reset_index(drop=True)

    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    splits = list(cv.split(X_train_val, y_train_val))

    def make_pipe(estimator: Any) -> Pipeline:
        return Pipeline(
            [
                ("extract", extractor),
                ("preprocess", _build_preprocessor(numeric_cols, categorical_cols)),
                ("reg", estimator),
            ]
        )

    candidates: list[tuple[str, Pipeline]] = [
        ("Baseline: Dummy (Median)", Pipeline([("reg", DummyRegressor(strategy="median"))])),
        ("Ridge Regression (Baseline)", make_pipe(Ridge(alpha=10.0, random_state=42))),
        (
            "Random Forest Regressor",
            make_pipe(
                RandomForestRegressor(
                    n_estimators=250,
                    max_depth=18,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                )
            ),
        ),
        (
            "XGBoost Regressor",
            make_pipe(
                XGBRegressor(
                    n_estimators=300,
                    max_depth=6,
                    learning_rate=0.06,
                    subsample=0.85,
                    colsample_bytree=0.85,
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
                    learning_rate=0.06,
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

    comparison_table: list[dict[str, Any]] = []
    best_name = ""
    best_pipeline: Pipeline | None = None
    best_mae = float("inf")

    for name, pipe in candidates:
        summary = _evaluate_regression_cv(name, pipe, X_train_val, y_train_val, splits)
        comparison_table.append(summary)
        print(
            f"  CV {name:30s} | MAE=Rs {summary['cv_mae_mean']:,.0f} "
            f"| RMSE=Rs {summary['cv_rmse_mean']:,.0f} | R2={summary['cv_r2_mean']:.4f}"
        )
        if not name.startswith("Baseline:") and summary["cv_mae_mean"] < best_mae:
            best_mae = summary["cv_mae_mean"]
            best_name = name
            best_pipeline = pipe

    assert best_pipeline is not None
    print(f"  Selected {sub_model} model (lowest CV MAE): {best_name}")

    best_pipeline.fit(X_train_val, y_train_val)
    test_preds = np.maximum(0.0, best_pipeline.predict(X_test))
    test_metrics = _compute_regression_metrics(y_test, test_preds)
    error_analysis = _build_regression_error_analysis(X_test, y_test, test_preds)

    bundle_path = ARTIFACTS_DIR / f"{sub_model}_price_bundle.joblib"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": best_pipeline,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "sub_model": sub_model,
        "test_mae": test_metrics["mae"],
        "ui_options": extra_ui_options,
    }
    joblib.dump(bundle, bundle_path)

    return {
        "module": "price",
        "sub_model": sub_model,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "dataset": data_info,
        "splits": {"train_val_rows": int(len(X_train_val)), "test_rows": int(len(X_test))},
        "thresholds": {"uncertainty_band_mae_inr": test_metrics["mae"]},
        "metrics": test_metrics,
        "comparison_table": comparison_table,
        "error_analysis": error_analysis,
        "limitations": limitations,
        "ui_options": extra_ui_options,
        "artifact_path": str(bundle_path.relative_to(REPO_ROOT).as_posix()),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def train_car_module(car_path: Path | None = None) -> dict[str, Any]:
    path = car_path or (DATA_DIR / "car_details.csv")
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run `python ml/price/download_data.py` first.")

    df, data_info = _load_vehicle_csv(path, CAR_RAW_COLUMNS)
    print(
        f"\n[CAR] Loaded {data_info['deduplicated_rows']} unique cars "
        f"(removed {data_info['duplicates_removed']} duplicates, "
        f"median price = Rs {data_info['median_price_inr']:,.0f})."
    )

    ui_options = {
        "fuels": sorted(df["fuel"].dropna().astype(str).unique().tolist()),
        "seller_types": sorted(df["seller_type"].dropna().astype(str).unique().tolist()),
        "transmissions": sorted(df["transmission"].dropna().astype(str).unique().tolist()),
        "owners": sorted(df["owner"].dropna().astype(str).unique().tolist()),
        "year_min": int(df["year"].min()),
        "year_max": int(df["year"].max()),
        "sample_names": df["name"].value_counts().head(12).index.tolist(),
    }

    limitations = [
        "Trained on 2020-snapshot CarDekho listings (INR); post-2020 inflation and newer model trims are not reflected.",
        "Only brand and primary model token are extracted from vehicle name; subtle trim/variant differences (e.g. VXI vs ZXI+) and accident/service history are unobserved.",
        "Luxury cars (> Rs 25 Lakh) have fewer samples, resulting in wider absolute MAE in the premium bracket.",
    ]

    return _train_vehicle_track(
        sub_model="car",
        df=df,
        data_info=data_info,
        raw_cols=CAR_RAW_COLUMNS,
        extractor=CarFeatureExtractor(reference_year=2020),
        numeric_cols=["year", "vehicle_age", "km_driven", "km_per_year"],
        categorical_cols=["brand", "model_word", "fuel", "seller_type", "transmission", "owner"],
        limitations=limitations,
        extra_ui_options=ui_options,
    )


def train_bike_module(bike_path: Path | None = None) -> dict[str, Any]:
    path = bike_path or (DATA_DIR / "bike_details.csv")
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}. Run `python ml/price/download_data.py` first.")

    df, data_info = _load_vehicle_csv(path, BIKE_RAW_COLUMNS)
    missing_ex = int(df["ex_showroom_price"].isna().sum())
    data_info["ex_showroom_missing_imputed_in_pipeline"] = missing_ex
    print(
        f"\n[BIKE] Loaded {data_info['deduplicated_rows']} unique bikes "
        f"(removed {data_info['duplicates_removed']} duplicates, "
        f"{missing_ex} missing ex_showroom_price values imputed inside CV folds)."
    )

    ui_options = {
        "seller_types": sorted(df["seller_type"].dropna().astype(str).unique().tolist()),
        "owners": sorted(df["owner"].dropna().astype(str).unique().tolist()),
        "year_min": int(df["year"].min()),
        "year_max": int(df["year"].max()),
        "sample_names": df["name"].value_counts().head(12).index.tolist(),
    }

    limitations = [
        "Dataset contains 1,055 unique bikes, with 41% missing ex_showroom_price (handled via median imputation + missingness indicator inside Pipeline).",
        "Trained on 2020-snapshot listings; electric scooters and newer BS6 Phase-2 models are underrepresented.",
        "Physical condition, city/state registration, and aftermarket accessories are not captured in tabular features.",
    ]

    return _train_vehicle_track(
        sub_model="bike",
        df=df,
        data_info=data_info,
        raw_cols=BIKE_RAW_COLUMNS,
        extractor=BikeFeatureExtractor(reference_year=2020),
        numeric_cols=[
            "year",
            "vehicle_age",
            "km_driven",
            "km_per_year",
            "ex_showroom_price",
            "engine_cc_hint",
        ],
        categorical_cols=["brand", "model_word", "seller_type", "owner"],
        limitations=limitations,
        extra_ui_options=ui_options,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Fair Price used car and bike regressors.")
    parser.add_argument("--car-path", type=Path, default=None)
    parser.add_argument("--bike-path", type=Path, default=None)
    args = parser.parse_args()

    car_meta = train_car_module(args.car_path)
    bike_meta = train_bike_module(args.bike_path)

    metadata_path = ARTIFACTS_DIR / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump([car_meta, bike_meta], fh, indent=2)

    print(f"\nSaved Fair Price artifacts and metadata to {ARTIFACTS_DIR}")


if __name__ == "__main__":
    main()
