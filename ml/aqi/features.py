"""Leakage-safe feature engineering & CPCB health advisory logic for Air Aware.

Kept in `ml.aqi.features` so joblib-saved sklearn/imblearn Pipelines deserialize cleanly
inside the FastAPI backend.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from ml.aqi.india_stations import resolve_station_geo

AQI_CATEGORIES = [
    "Good",
    "Satisfactory",
    "Moderate",
    "Poor",
    "Very Poor",
    "Severe",
]
CATEGORY_TO_INT = {name: idx for idx, name in enumerate(AQI_CATEGORIES)}
INT_TO_CATEGORY = {idx: name for idx, name in enumerate(AQI_CATEGORIES)}

AQI_RAW_COLUMNS = [
    "station",
    "date",
    "PM2.5",
    "PM10",
    "SO2",
    "NO2",
    "CO_mg",
    "O3",
    "TEMP",
    "PRES",
    "DEWP",
    "RAIN",
    "WSPM",
    "AQI",
    "aqi_lag1",
    "aqi_roll3_mean",
    "aqi_roll7_mean",
    "wspm_roll3_mean",
]

AQI_NUMERIC_FEATURES = [
    "PM2.5",
    "PM10",
    "SO2",
    "NO2",
    "CO_mg",
    "O3",
    "TEMP",
    "PRES",
    "DEWP",
    "RAIN",
    "WSPM",
    "AQI",
    "aqi_lag1",
    "aqi_roll3_mean",
    "aqi_roll7_mean",
    "wspm_roll3_mean",
    "temp_dew_spread",
    "pm_ratio",
    "pm25_x_wind_inv",
    "aqi_momentum_1d",
    "month_sin",
    "month_cos",
    "dow_sin",
    "dow_cos",
    "is_winter_heating",
    "latitude",
    "longitude",
]

AQI_CATEGORICAL_FEATURES = ["state"]


def build_causal_station_history(df: pd.DataFrame) -> pd.DataFrame:
    """Create strictly backward-looking lags and t+1 chronological targets within each station.

    Never mixes different stations and strictly checks `(date_{t+1} - date_t).days == 1`
    so missing calendar days never become false consecutive-day targets.
    """
    ordered = df.copy()
    ordered["dt"] = pd.to_datetime(ordered["date"])
    ordered = ordered.sort_values(["station", "dt"]).reset_index(drop=True)

    grp = ordered.groupby("station", sort=False)
    ordered["aqi_lag1"] = grp["AQI"].shift(1)
    ordered["aqi_roll3_mean"] = grp["AQI"].transform(lambda s: s.rolling(3, min_periods=1).mean())
    ordered["aqi_roll7_mean"] = grp["AQI"].transform(lambda s: s.rolling(7, min_periods=1).mean())
    ordered["wspm_roll3_mean"] = grp["WSPM"].transform(lambda s: s.rolling(3, min_periods=1).mean())

    ordered["next_dt"] = grp["dt"].shift(-1)
    ordered["next_day_aqi"] = grp["AQI"].shift(-1)
    ordered["next_day_category"] = grp["AQI_Category"].shift(-1)

    valid = ordered[(ordered["next_dt"] - ordered["dt"]).dt.days == 1].copy()
    valid = valid.dropna(subset=["next_day_aqi", "next_day_category"]).reset_index(drop=True)
    # Sort globally by calendar date ascending before chronological splits
    return valid.sort_values(["dt", "station"]).reset_index(drop=True)


class AqiFeatureExtractor(BaseEstimator, TransformerMixin):
    """Stateless row-level feature builder deriving seasonality and meteorology interactions."""

    def fit(self, X: pd.DataFrame, y: Any = None):  # noqa: N803
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        df = X.copy() if isinstance(X, pd.DataFrame) else pd.DataFrame(X)
        dt = pd.to_datetime(df["date"], errors="coerce")
        months = dt.dt.month.fillna(6).astype(int)
        dows = dt.dt.dayofweek.fillna(0).astype(int)

        pm25 = pd.to_numeric(df["PM2.5"], errors="coerce")
        pm10 = pd.to_numeric(df["PM10"], errors="coerce")
        temp = pd.to_numeric(df["TEMP"], errors="coerce")
        dewp = pd.to_numeric(df["DEWP"], errors="coerce")
        wspm = pd.to_numeric(df["WSPM"], errors="coerce")
        aqi = pd.to_numeric(df["AQI"], errors="coerce")
        aqi_lag1 = pd.to_numeric(df["aqi_lag1"], errors="coerce")

        stations_clean = df["station"].astype(str).str.strip().tolist()
        raw_states = (
            df["state"].tolist() if "state" in df.columns else [None] * len(df)
        )
        raw_lats = (
            pd.to_numeric(df["latitude"], errors="coerce").tolist()
            if "latitude" in df.columns
            else [np.nan] * len(df)
        )
        raw_lons = (
            pd.to_numeric(df["longitude"], errors="coerce").tolist()
            if "longitude" in df.columns
            else [np.nan] * len(df)
        )

        geo_cache: dict[tuple[str, str | None], tuple[str, float | None, float | None]] = {}
        states_resolved: list[str] = []
        lats_resolved: list[float] = []
        lons_resolved: list[float] = []

        for st_name, st_hint, lat_in, lon_in in zip(stations_clean, raw_states, raw_lats, raw_lons):
            hint_clean = (
                None
                if st_hint is None or (isinstance(st_hint, float) and np.isnan(st_hint)) or str(st_hint).strip() in ("", "None", "nan")
                else str(st_hint).strip()
            )
            has_coords = pd.notna(lat_in) and pd.notna(lon_in)
            if hint_clean and has_coords:
                states_resolved.append(hint_clean)
                lats_resolved.append(float(lat_in))
                lons_resolved.append(float(lon_in))
                continue

            ckey = (st_name, hint_clean)
            if ckey not in geo_cache:
                geo_cache[ckey] = resolve_station_geo(st_name, state_hint=hint_clean)
            r_state, r_lat, r_lon = geo_cache[ckey]
            states_resolved.append(hint_clean or r_state)
            lats_resolved.append(float(lat_in) if pd.notna(lat_in) else (float(r_lat) if r_lat is not None else np.nan))
            lons_resolved.append(float(lon_in) if pd.notna(lon_in) else (float(r_lon) if r_lon is not None else np.nan))

        out: dict[str, Any] = {
            "station": pd.Series(stations_clean, index=df.index, dtype="object"),
            "state": pd.Series(states_resolved, index=df.index, dtype="object"),
            "latitude": pd.Series(lats_resolved, index=df.index, dtype=np.float64),
            "longitude": pd.Series(lons_resolved, index=df.index, dtype=np.float64),
            "PM2.5": pm25,
            "PM10": pm10,
            "SO2": pd.to_numeric(df["SO2"], errors="coerce"),
            "NO2": pd.to_numeric(df["NO2"], errors="coerce"),
            "CO_mg": pd.to_numeric(df["CO_mg"], errors="coerce"),
            "O3": pd.to_numeric(df["O3"], errors="coerce"),
            "TEMP": temp,
            "PRES": pd.to_numeric(df["PRES"], errors="coerce"),
            "DEWP": dewp,
            "RAIN": pd.to_numeric(df["RAIN"], errors="coerce"),
            "WSPM": wspm,
            "AQI": aqi,
            "aqi_lag1": aqi_lag1,
            "aqi_roll3_mean": pd.to_numeric(df["aqi_roll3_mean"], errors="coerce"),
            "aqi_roll7_mean": pd.to_numeric(df["aqi_roll7_mean"], errors="coerce"),
            "wspm_roll3_mean": pd.to_numeric(df["wspm_roll3_mean"], errors="coerce"),
            "temp_dew_spread": temp - dewp,
            "pm_ratio": pm25 / np.maximum(pm10, 1.0),
            "pm25_x_wind_inv": pm25 / (np.maximum(wspm, 0.0) + 0.5),
            "aqi_momentum_1d": aqi - aqi_lag1,
            "month_sin": np.sin(2.0 * math.pi * months / 12.0),
            "month_cos": np.cos(2.0 * math.pi * months / 12.0),
            "dow_sin": np.sin(2.0 * math.pi * dows / 7.0),
            "dow_cos": np.cos(2.0 * math.pi * dows / 7.0),
            "is_winter_heating": months.isin([11, 12, 1, 2, 3]).astype(np.float64),
        }
        return pd.DataFrame(out, index=df.index)


def aqi_bucket_from_value(aqi_val: float) -> str:
    if aqi_val <= 50:
        return "Good"
    if aqi_val <= 100:
        return "Satisfactory"
    if aqi_val <= 200:
        return "Moderate"
    if aqi_val <= 300:
        return "Poor"
    if aqi_val <= 400:
        return "Very Poor"
    return "Severe"


def get_health_advice(category: str, unhealthy_alert: bool) -> dict[str, Any]:
    """Return actionable health guidance aligned with CPCB AQI risk categories."""
    advisories = {
        "Good": {
            "risk_level": "Minimal Impact",
            "general_public": "Air quality is clean; ideal conditions for outdoor exercise and commuting.",
            "sensitive_groups": "No special precautions required.",
            "outdoor_activity": "Unrestricted outdoor activities.",
            "mask_guidance": "No mask needed.",
        },
        "Satisfactory": {
            "risk_level": "Minor Breathing Discomfort to Sensitive People",
            "general_public": "Acceptable air quality for normal daily routines and outdoor workouts.",
            "sensitive_groups": "Individuals with severe asthma should monitor mild symptoms during sustained exertion.",
            "outdoor_activity": "Normal outdoor activity is safe.",
            "mask_guidance": "Optional for hyper-sensitive commuters near heavy traffic.",
        },
        "Moderate": {
            "risk_level": "Breathing Discomfort to Lung, Asthma & Heart Patients",
            "general_public": "Reduce prolonged high-intensity outdoor workouts if experiencing throat irritation.",
            "sensitive_groups": "Children, elderly, and asthma/COPD patients should shorten outdoor exertion.",
            "outdoor_activity": "Prefer lighter outdoor sessions or indoor gyms during peak traffic hours.",
            "mask_guidance": "Consider an N95/KN95 mask near congested roadways.",
        },
        "Poor": {
            "risk_level": "Breathing Discomfort on Prolonged Exposure",
            "general_public": "Limit prolonged outdoor exertion; keep rescue inhalers accessible if asthmatic.",
            "sensitive_groups": "Avoid vigorous outdoor activity; run HEPA indoor air filtration if available.",
            "outdoor_activity": "Move workouts indoors and keep windows shut during morning/evening haze peaks.",
            "mask_guidance": "N95/KN95 mask strongly recommended outdoors.",
        },
        "Very Poor": {
            "risk_level": "Respiratory Illness on Prolonged Exposure",
            "general_public": "Avoid sustained outdoor physical exertion and commute exposure where possible.",
            "sensitive_groups": "Stay indoors with filtered air; watch for wheezing, chest tightness, or fatigue.",
            "outdoor_activity": "Cancel outdoor sports/jogging and minimize outdoor travel.",
            "mask_guidance": "Wear a tight-fitting N95/FFP2 respirator outdoors.",
        },
        "Severe": {
            "risk_level": "Severe Health Emergency Impact",
            "general_public": "Remain indoors cleanly; even healthy adults may experience respiratory irritation.",
            "sensitive_groups": "High risk for heart/lung patients, elderly, and children — remain indoors strictly.",
            "outdoor_activity": "Avoid all non-essential outdoor activity.",
            "mask_guidance": "Certified N95/FFP2 respirator mandatory if stepping outside.",
        },
    }
    base = dict(advisories.get(category, advisories["Moderate"]))
    if unhealthy_alert and category in ("Good", "Satisfactory", "Moderate"):
        base["alert_note"] = (
            "Unhealthy-spike probability exceeded threshold; sensitive groups should still carry precautions tomorrow."
        )
    else:
        base["alert_note"] = None
    return base
