"""Leakage-safe clinical cleaners & feature formatters for Health Check.

Kept in `ml.health.features` so joblib-saved imblearn/sklearn Pipelines deserialize
cleanly inside the FastAPI backend.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

DIABETES_RAW_COLUMNS = [
    "Pregnancies",
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
    "DiabetesPedigreeFunction",
    "Age",
]
DIABETES_ZERO_AS_NAN_COLS = ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]

HEART_NUMERIC_COLS = ["age", "sex", "trestbps", "chol", "fbs", "thalach", "exang", "oldpeak", "ca"]
HEART_CATEGORICAL_COLS = ["cp", "restecg", "slope", "thal"]
HEART_RAW_COLUMNS = [
    "age",
    "sex",
    "cp",
    "trestbps",
    "chol",
    "fbs",
    "restecg",
    "thalach",
    "exang",
    "oldpeak",
    "slope",
    "ca",
    "thal",
]


class DiabetesClinicalCleaner(BaseEstimator, TransformerMixin):
    """Replace biologically impossible zeros in clinical measurements with NaN inside CV folds."""

    def __init__(self, zero_as_nan_cols: tuple[str, ...] = tuple(DIABETES_ZERO_AS_NAN_COLS)) -> None:
        self.zero_as_nan_cols = zero_as_nan_cols

    def fit(self, X: pd.DataFrame, y: Any = None):  # noqa: N803
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        df = X[DIABETES_RAW_COLUMNS].copy() if isinstance(X, pd.DataFrame) else pd.DataFrame(X, columns=DIABETES_RAW_COLUMNS)
        for col in DIABETES_RAW_COLUMNS:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype(np.float64)
        for col in self.zero_as_nan_cols:
            if col in df.columns:
                df.loc[df[col] <= 0, col] = np.nan
        return df


class HeartClinicalFormatter(BaseEstimator, TransformerMixin):
    """Ensure Heart Disease numeric & categorical clinical columns have consistent dtypes."""

    def fit(self, X: pd.DataFrame, y: Any = None):  # noqa: N803
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        df = X[HEART_RAW_COLUMNS].copy() if isinstance(X, pd.DataFrame) else pd.DataFrame(X, columns=HEART_RAW_COLUMNS)
        for col in HEART_NUMERIC_COLS:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype(np.float64)
        for col in HEART_CATEGORICAL_COLS:
            numeric_vals = pd.to_numeric(df[col], errors="coerce")
            df[col] = numeric_vals.round(0)
        return df
