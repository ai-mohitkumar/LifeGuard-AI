"""Leakage-safe feature extractors for Fair Price (Used Car & Bike Regression).

Kept in `ml.price.features` so joblib-saved sklearn Pipelines deserialize cleanly
inside the FastAPI backend without __main__ module import issues.
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

CAR_RAW_COLUMNS = ["name", "year", "km_driven", "fuel", "seller_type", "transmission", "owner"]
BIKE_RAW_COLUMNS = ["name", "year", "km_driven", "seller_type", "owner", "ex_showroom_price"]

_MULTIWORD_BRANDS = (
    "royal enfield",
    "land rover",
    "aston martin",
    "mercedes-benz",
    "harley davidson",
    "hero honda",
)
_CC_PATTERN = re.compile(r"\b(1?\d{3}|[5-9]\d)\b")


def _extract_brand_and_model(raw_name: str) -> tuple[str, str]:
    """Parse normalized brand and primary model token from a listing title."""
    cleaned = re.sub(r"\s+", " ", str(raw_name or "").strip().lower())
    if not cleaned:
        return "unknown", "unknown"

    for multi in _MULTIWORD_BRANDS:
        if cleaned.startswith(multi):
            rest = cleaned[len(multi) :].strip().split()
            model_tok = rest[0] if rest else "unknown"
            return multi, model_tok

    tokens = cleaned.split()
    brand = tokens[0]
    model_tok = tokens[1] if len(tokens) > 1 else "unknown"
    return brand, model_tok


def _extract_bike_cc_hint(raw_name: str) -> float:
    """Extract plausible engine displacement (cc) from bike name, or NaN if absent."""
    text = str(raw_name or "")
    for match in _CC_PATTERN.finditer(text):
        val = int(match.group(1))
        if 50 <= val <= 1800:
            return float(val)
    return float("nan")


class CarFeatureExtractor(BaseEstimator, TransformerMixin):
    """Stateless transformer deriving brand, model token, age, and usage rate for cars."""

    def __init__(self, reference_year: int = 2020) -> None:
        self.reference_year = reference_year

    def fit(self, X: pd.DataFrame, y: Any = None):  # noqa: N803
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        df = X.copy() if isinstance(X, pd.DataFrame) else pd.DataFrame(X)
        parsed = [_extract_brand_and_model(n) for n in df["name"].astype(str)]
        years = pd.to_numeric(df["year"], errors="coerce")
        kms = pd.to_numeric(df["km_driven"], errors="coerce")
        age = (self.reference_year - years).clip(lower=0)

        return pd.DataFrame(
            {
                "year": years,
                "vehicle_age": age,
                "km_driven": kms,
                "km_per_year": kms / age.clip(lower=1),
                "brand": [p[0] for p in parsed],
                "model_word": [p[1] for p in parsed],
                "fuel": df["fuel"].astype(str).str.strip(),
                "seller_type": df["seller_type"].astype(str).str.strip(),
                "transmission": df["transmission"].astype(str).str.strip(),
                "owner": df["owner"].astype(str).str.strip(),
            },
            index=df.index,
        )


class BikeFeatureExtractor(BaseEstimator, TransformerMixin):
    """Stateless transformer deriving brand, model token, cc hint, age, and usage rate for bikes."""

    def __init__(self, reference_year: int = 2020) -> None:
        self.reference_year = reference_year

    def fit(self, X: pd.DataFrame, y: Any = None):  # noqa: N803
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        df = X.copy() if isinstance(X, pd.DataFrame) else pd.DataFrame(X)
        names = df["name"].astype(str)
        parsed = [_extract_brand_and_model(n) for n in names]
        cc_hints = [_extract_bike_cc_hint(n) for n in names]

        years = pd.to_numeric(df["year"], errors="coerce")
        kms = pd.to_numeric(df["km_driven"], errors="coerce")
        ex_showroom = pd.to_numeric(df["ex_showroom_price"], errors="coerce")
        age = (self.reference_year - years).clip(lower=0)

        return pd.DataFrame(
            {
                "year": years,
                "vehicle_age": age,
                "km_driven": kms,
                "km_per_year": kms / age.clip(lower=1),
                "ex_showroom_price": ex_showroom,
                "engine_cc_hint": np.asarray(cc_hints, dtype=np.float64),
                "brand": [p[0] for p in parsed],
                "model_word": [p[1] for p in parsed],
                "seller_type": df["seller_type"].astype(str).str.strip(),
                "owner": df["owner"].astype(str).str.strip(),
            },
            index=df.index,
        )
