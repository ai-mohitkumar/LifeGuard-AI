"""Air Aware ML inference, SHAP valuation, All-India outlook, live fetch, and CPCB health advisory service."""

from __future__ import annotations

from collections import Counter
from datetime import date
from functools import lru_cache
import json
from pathlib import Path
import sys
from typing import Any

from fastapi import HTTPException, status
import httpx
import joblib
import numpy as np
import pandas as pd
import shap

from app.config import settings

# Ensure `ml/` is importable before unpickling pipelines referencing ml.aqi.features
ML_PARENT_DIR = Path(settings.ML_DIR).resolve().parent
if str(ML_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(ML_PARENT_DIR))

from ml.aqi.download_data import (  # noqa: E402
    AQ_HOURLY_VARS,
    OPEN_METEO_AQ_URL,
    OPEN_METEO_FORECAST_URL,
    WX_DAILY_VARS,
    _parse_daily_weather,
    _parse_hourly_aq_to_daily,
    compute_daily_aqi,
)
from ml.aqi.features import (  # noqa: E402
    AQI_CATEGORIES,
    AQI_RAW_COLUMNS,
    CATEGORY_TO_INT,
    aqi_bucket_from_value,
    get_health_advice,
)
from ml.aqi.india_stations import (  # noqa: E402
    ALL_INDIA_STATES_AND_UTS,
    INDIA_STATIONS_PATH,
    clear_station_lookup_cache,
    resolve_station_geo,
)

FEATURE_LABELS = {
    "station": "Monitoring Station",
    "state": "State / Union Territory",
    "latitude": "Latitude (°N)",
    "longitude": "Longitude (°E)",
    "PM2.5": "Today's PM2.5 (µg/m³)",
    "PM10": "Today's PM10 (µg/m³)",
    "SO2": "SO2 (µg/m³)",
    "NO2": "NO2 (µg/m³)",
    "CO_mg": "CO (mg/m³)",
    "O3": "Peak O3 (µg/m³)",
    "TEMP": "Temperature (°C)",
    "PRES": "Pressure (hPa)",
    "DEWP": "Dew Point (°C)",
    "RAIN": "Daily Rain (mm)",
    "WSPM": "Wind Speed (m/s)",
    "AQI": "Today's AQI",
    "aqi_lag1": "Yesterday AQI (Lag 1)",
    "aqi_roll3_mean": "3-Day Avg AQI",
    "aqi_roll7_mean": "7-Day Avg AQI",
    "wspm_roll3_mean": "3-Day Avg Wind",
    "temp_dew_spread": "Temp-Dew Spread (°C)",
    "pm_ratio": "PM2.5 / PM10 Ratio",
    "pm25_x_wind_inv": "PM2.5 / Wind Dispersion",
    "aqi_momentum_1d": "1-Day AQI Change",
    "month_sin": "Seasonality (Month Sin)",
    "month_cos": "Seasonality (Month Cos)",
    "dow_sin": "Day-of-Week Sin",
    "dow_cos": "Day-of-Week Cos",
    "is_winter_heating": "Winter Season",
}

UNHEALTHY_CLASSES = [CATEGORY_TO_INT[c] for c in ("Poor", "Very Poor", "Severe")]


def _artifacts_dir() -> Path:
    return Path(settings.ML_DIR) / "aqi" / "artifacts"


@lru_cache(maxsize=4)
def _load_bundle(bundle_filename: str) -> dict[str, Any]:
    bundle_path = _artifacts_dir() / bundle_filename
    if not bundle_path.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Air Aware model artifact '{bundle_filename}' not found. "
                "Run `python ml/aqi/train.py` first."
            ),
        )
    return joblib.load(bundle_path)


@lru_cache(maxsize=4)
def _get_tree_explainer(model_key: str, reg: Any) -> shap.TreeExplainer:
    return shap.TreeExplainer(reg)


def clear_aqi_model_cache() -> None:
    """Clear cached joblib bundles, SHAP explainers, station lookups, and All-India overview."""
    _load_bundle.cache_clear()
    _get_tree_explainer.cache_clear()
    _compute_cached_india_overview.cache_clear()
    clear_station_lookup_cache()


def _format_val(col: str, raw_val: Any) -> float | str | None:
    if raw_val is None or (isinstance(raw_val, (float, np.floating)) and np.isnan(raw_val)):
        return "Imputed"
    if col in ("station", "state"):
        return str(raw_val)
    return round(float(raw_val), 2)


def _compute_regression_shap(pipeline: Any, raw_df: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    extract_step = pipeline.named_steps["extract"]
    preprocess_step = pipeline.named_steps["preprocess"]
    reg = pipeline.named_steps["reg"]

    extracted_df = extract_step.transform(raw_df)
    X_pre = preprocess_step.transform(extracted_df)
    transformed_names = preprocess_step.get_feature_names_out()

    if hasattr(reg, "coef_"):
        shap_row = np.asarray(X_pre[0], dtype=np.float64) * np.asarray(reg.coef_, dtype=np.float64)
    else:
        explainer = _get_tree_explainer(f"aqi:{type(reg).__name__}", reg)
        raw_shap = explainer.shap_values(X_pre)
        arr = np.asarray(raw_shap, dtype=np.float64)
        shap_row = arr[0] if arr.ndim == 2 else arr.reshape(-1)

    cols_desc = sorted(extracted_df.columns.tolist(), key=len, reverse=True)
    grouped: dict[str, float] = {col: 0.0 for col in extracted_df.columns}
    for feat_name, phi in zip(transformed_names, shap_row):
        for col in cols_desc:
            if (
                feat_name == f"num__{col}"
                or feat_name == f"num__missingindicator_{col}"
                or feat_name.startswith(f"cat__{col}_")
            ):
                grouped[col] += float(phi)
                break

    extracted_clean: dict[str, Any] = {}
    contributors: list[dict[str, Any]] = []
    for col in extracted_df.columns:
        val = extracted_df.iloc[0][col]
        formatted = _format_val(col, val)
        extracted_clean[col] = None if formatted == "Imputed" else formatted
        score = float(grouped[col])
        contributors.append(
            {
                "feature": FEATURE_LABELS.get(col, col),
                "value": formatted,
                "contribution": round(score, 2),
                "direction": "increases_aqi" if score >= 0 else "improves_air",
            }
        )

    contributors.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    return contributors[:8], extracted_clean


def predict_next_day_aqi(payload: dict[str, Any]) -> dict[str, Any]:
    """Predict tomorrow's numeric AQI, category probabilities, SHAP drivers, and health advice."""
    reg_bundle = _load_bundle("aqi_regressor_bundle.joblib")
    cls_bundle = _load_bundle("aqi_classifier_bundle.joblib")

    row: dict[str, Any] = {}
    for col in AQI_RAW_COLUMNS:
        val = payload.get(col)
        if col in ("station", "date"):
            row[col] = str(val)
        else:
            row[col] = np.nan if val is None else float(val)

    resolved_state, resolved_lat, resolved_lon = resolve_station_geo(
        row["station"],
        state_hint=payload.get("state"),
    )
    row["state"] = resolved_state
    row["latitude"] = np.nan if resolved_lat is None else float(resolved_lat)
    row["longitude"] = np.nan if resolved_lon is None else float(resolved_lon)

    raw_cols = list(AQI_RAW_COLUMNS) + ["state", "latitude", "longitude"]
    raw_df = pd.DataFrame([row], columns=raw_cols)

    # 1. Regression prediction
    reg_pipe = reg_bundle["pipeline"]
    pred_aqi = float(np.clip(reg_pipe.predict(raw_df)[0], 0.0, 500.0))
    test_mae = float(reg_bundle["test_mae"])
    aqi_low = max(0.0, round(pred_aqi - test_mae, 1))
    aqi_high = min(500.0, round(pred_aqi + test_mae, 1))

    # 2. Classification probabilities across 6 CPCB AQI categories
    cls_pipe = cls_bundle["pipeline"]
    probs = cls_pipe.predict_proba(raw_df)[0]
    cat_probs = {cat: round(float(probs[idx]), 4) for idx, cat in enumerate(AQI_CATEGORIES)}
    predicted_cat = AQI_CATEGORIES[int(np.argmax(probs))]
    implied_cat = aqi_bucket_from_value(pred_aqi)

    unhealthy_prob = float(np.sum(probs[UNHEALTHY_CLASSES]))
    unhealthy_thr = float(cls_bundle["unhealthy_alert_threshold"])
    unhealthy_alert = unhealthy_prob >= unhealthy_thr

    contributors, extracted_clean = _compute_regression_shap(reg_pipe, raw_df)
    advice = get_health_advice(predicted_cat, unhealthy_alert)

    top_up = [c["feature"] for c in contributors if c["direction"] == "increases_aqi"][:2]
    top_down = [c["feature"] for c in contributors if c["direction"] == "improves_air"][:2]
    parts = []
    if top_up:
        parts.append(f"upward AQI pressure from {', '.join(top_up)}")
    if top_down:
        parts.append(f"dispersion/improvement from {', '.join(top_down)}")
    drivers_text = " and ".join(parts) if parts else "balanced atmospheric conditions"

    location_label = (
        f"{row['station']} ({resolved_state})"
        if resolved_state and resolved_state != "Other" and resolved_state.lower() not in row["station"].lower()
        else row["station"]
    )
    summary = (
        f"Next-day AQI forecast for {location_label} is {pred_aqi:.1f} ({predicted_cat}, "
        f"typical MAE band {aqi_low:.0f}–{aqi_high:.0f}) with {unhealthy_prob:.1%} probability "
        f"of Poor-or-worse air quality, shaped by {drivers_text}."
    )

    return {
        "predicted_next_day_aqi": round(pred_aqi, 1),
        "aqi_range_low": aqi_low,
        "aqi_range_high": aqi_high,
        "uncertainty_mae": round(test_mae, 2),
        "predicted_category": predicted_cat,
        "regression_implied_category": implied_cat,
        "category_probabilities": cat_probs,
        "unhealthy_probability": round(unhealthy_prob, 4),
        "unhealthy_alert": bool(unhealthy_alert),
        "unhealthy_alert_threshold": unhealthy_thr,
        "regressor_model_name": reg_bundle["model_name"],
        "classifier_model_name": cls_bundle["model_name"],
        "model_version": reg_bundle["version"],
        "health_advice": advice,
        "top_contributors": contributors,
        "extracted_features": extracted_clean,
        "explanation_summary": summary,
    }


def _load_stations_directory() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Load the All-India stations & states directory from data/aqi/india_stations.json or bundle fallback."""
    if INDIA_STATIONS_PATH.exists():
        try:
            meta = json.loads(INDIA_STATIONS_PATH.read_text(encoding="utf-8"))
            if isinstance(meta, dict) and meta.get("stations"):
                return meta.get("states", []), meta.get("stations", [])
        except Exception:
            pass
    reg_bundle = _load_bundle("aqi_regressor_bundle.joblib")
    ui_opts = reg_bundle.get("ui_options", {})
    return ui_opts.get("states", []), ui_opts.get("stations_directory", [])


def get_aqi_options() -> dict[str, Any]:
    """Return all 36 Indian States/UTs, 545+ monitoring stations, categories, presets, and timelines."""
    reg_bundle = _load_bundle("aqi_regressor_bundle.joblib")
    ui_opts = dict(reg_bundle.get("ui_options", {}))
    states, stations_dir = _load_stations_directory()
    if states and not ui_opts.get("states"):
        ui_opts["states"] = states
    if stations_dir and not ui_opts.get("stations_directory"):
        ui_opts["stations_directory"] = stations_dir
        ui_opts["stations"] = sorted({str(r["station"]) for r in stations_dir})
    return ui_opts


@lru_cache(maxsize=2)
def _compute_cached_india_overview(cache_tag: str) -> dict[str, Any]:
    reg_bundle = _load_bundle("aqi_regressor_bundle.joblib")
    cls_bundle = _load_bundle("aqi_classifier_bundle.joblib")
    _, stations_dir = _load_stations_directory()

    if not stations_dir:
        return {
            "country": "India",
            "total_states": 0,
            "total_stations": 0,
            "total_cities": 0,
            "states": [],
            "stations": [],
        }

    reg_pipe = reg_bundle["pipeline"]
    cls_pipe = cls_bundle["pipeline"]
    unhealthy_thr = float(cls_bundle["unhealthy_alert_threshold"])

    raw_cols = list(AQI_RAW_COLUMNS) + ["state", "latitude", "longitude"]
    batch_rows: list[dict[str, Any]] = []
    valid_records: list[dict[str, Any]] = []

    for rec in stations_dir:
        snap = rec.get("sample_snapshot")
        if not snap:
            continue
        row = {
            "station": str(rec["station"]),
            "date": str(snap["date"]),
            "PM2.5": float(snap["PM2.5"]) if snap.get("PM2.5") is not None else np.nan,
            "PM10": float(snap["PM10"]) if snap.get("PM10") is not None else np.nan,
            "SO2": float(snap["SO2"]) if snap.get("SO2") is not None else np.nan,
            "NO2": float(snap["NO2"]) if snap.get("NO2") is not None else np.nan,
            "CO_mg": float(snap["CO_mg"]) if snap.get("CO_mg") is not None else np.nan,
            "O3": float(snap["O3"]) if snap.get("O3") is not None else np.nan,
            "TEMP": float(snap["TEMP"]) if snap.get("TEMP") is not None else np.nan,
            "PRES": float(snap["PRES"]) if snap.get("PRES") is not None else np.nan,
            "DEWP": float(snap["DEWP"]) if snap.get("DEWP") is not None else np.nan,
            "RAIN": float(snap.get("RAIN", 0.0)),
            "WSPM": float(snap["WSPM"]) if snap.get("WSPM") is not None else np.nan,
            "AQI": float(snap["AQI"]) if snap.get("AQI") is not None else np.nan,
            "aqi_lag1": float(snap["aqi_lag1"]) if snap.get("aqi_lag1") is not None else np.nan,
            "aqi_roll3_mean": float(snap["aqi_roll3_mean"]) if snap.get("aqi_roll3_mean") is not None else np.nan,
            "aqi_roll7_mean": float(snap["aqi_roll7_mean"]) if snap.get("aqi_roll7_mean") is not None else np.nan,
            "wspm_roll3_mean": float(snap["wspm_roll3_mean"]) if snap.get("wspm_roll3_mean") is not None else np.nan,
            "state": str(rec["state"]),
            "latitude": float(rec["lat"]),
            "longitude": float(rec["lon"]),
        }
        batch_rows.append(row)
        valid_records.append(rec)

    batch_df = pd.DataFrame(batch_rows, columns=raw_cols)
    pred_aqis = np.clip(reg_pipe.predict(batch_df), 0.0, 500.0)
    probs = cls_pipe.predict_proba(batch_df)
    unhealthy_probs = np.sum(probs[:, UNHEALTHY_CLASSES], axis=1)

    station_forecasts: list[dict[str, Any]] = []
    by_state: dict[str, list[dict[str, Any]]] = {st: [] for st in ALL_INDIA_STATES_AND_UTS}

    for rec, pred_aqi, prob_row, un_prob in zip(valid_records, pred_aqis, probs, unhealthy_probs):
        snap = rec["sample_snapshot"]
        pred_cat = AQI_CATEGORIES[int(np.argmax(prob_row))]
        unhealthy_alert = bool(float(un_prob) >= unhealthy_thr)
        entry = {
            "station": str(rec["station"]),
            "state": str(rec["state"]),
            "city": str(rec["city"]),
            "lat": round(float(rec["lat"]), 4),
            "lon": round(float(rec["lon"]), 4),
            "source_type": str(rec.get("source_type", "CPCB")),
            "cpcb_obs_days": int(rec.get("cpcb_obs_days", 0)),
            "cpcb_mean_aqi": rec.get("cpcb_mean_aqi"),
            "snapshot_date": str(snap["date"]),
            "today_aqi": round(float(snap["AQI"]), 1),
            "predicted_next_day_aqi": round(float(pred_aqi), 1),
            "predicted_category": pred_cat,
            "unhealthy_probability": round(float(un_prob), 4),
            "unhealthy_alert": unhealthy_alert,
            "pm25": snap.get("PM2.5"),
            "pm10": snap.get("PM10"),
            "temp": snap.get("TEMP"),
            "wind": snap.get("WSPM"),
            "sample_snapshot": snap,
        }
        station_forecasts.append(entry)
        by_state.setdefault(entry["state"], []).append(entry)

    state_summaries: list[dict[str, Any]] = []
    for st_name in sorted(ALL_INDIA_STATES_AND_UTS.keys()):
        meta = ALL_INDIA_STATES_AND_UTS[st_name]
        items = by_state.get(st_name, [])
        if not items:
            continue
        vals = [x["predicted_next_day_aqi"] for x in items]
        today_vals = [x["today_aqi"] for x in items]
        cats = Counter(x["predicted_category"] for x in items)
        dominant_cat = cats.most_common(1)[0][0]
        mean_val = round(float(np.mean(vals)), 1)
        state_summaries.append(
            {
                "state": st_name,
                "type": meta["type"],
                "capital": meta["capital"],
                "lat": meta["lat"],
                "lon": meta["lon"],
                "station_count": len(items),
                "city_count": len({x["city"] for x in items}),
                "mean_today_aqi": round(float(np.mean(today_vals)), 1),
                "mean_predicted_aqi": mean_val,
                "max_predicted_aqi": round(float(np.max(vals)), 1),
                "min_predicted_aqi": round(float(np.min(vals)), 1),
                "dominant_category": dominant_cat,
                "unhealthy_station_count": sum(1 for x in items if x["unhealthy_alert"]),
                "sample_station": items[0]["station"],
            }
        )

    snapshot_dates = [x["snapshot_date"] for x in station_forecasts]
    return {
        "country": "India",
        "model_version": reg_bundle["version"],
        "regressor_model_name": reg_bundle["model_name"],
        "classifier_model_name": cls_bundle["model_name"],
        "snapshot_date": max(snapshot_dates) if snapshot_dates else date.today().isoformat(),
        "total_states": len(state_summaries),
        "total_stations": len(station_forecasts),
        "total_cities": len({(x["state"], x["city"]) for x in station_forecasts}),
        "states": state_summaries,
        "stations": station_forecasts,
    }


def get_india_overview() -> dict[str, Any]:
    """Return fast batched next-day AQI forecasts across all 36 States/UTs and 545+ stations."""
    reg_bundle = _load_bundle("aqi_regressor_bundle.joblib")
    cls_bundle = _load_bundle("aqi_classifier_bundle.joblib")
    mtime = INDIA_STATIONS_PATH.stat().st_mtime if INDIA_STATIONS_PATH.exists() else 0.0
    cache_tag = f"{reg_bundle['version']}:{cls_bundle['version']}:{mtime}"
    return _compute_cached_india_overview(cache_tag)


def fetch_station_live_reading(station_name: str, state_hint: str | None = None) -> dict[str, Any]:
    """Fetch current Open-Meteo Copernicus CAMS + Weather readings & causal lags for any Indian station,
    falling back gracefully to cached CPCB/Open-Meteo snapshot if offline."""
    _, stations_dir = _load_stations_directory()
    matched = next(
        (rec for rec in stations_dir if rec["station"].lower() == station_name.strip().lower()),
        None,
    )
    resolved_state, lat, lon = resolve_station_geo(station_name, state_hint=state_hint)
    if matched:
        resolved_state = matched["state"]
        lat = matched["lat"]
        lon = matched["lon"]

    today_str = date.today().isoformat()
    if lat is not None and lon is not None:
        try:
            with httpx.Client(timeout=6.0, headers={"User-Agent": "LifeGuard-AI/1.0"}) as client:
                r_aq = client.get(
                    OPEN_METEO_AQ_URL,
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "past_days": 8,
                        "forecast_days": 1,
                        "hourly": AQ_HOURLY_VARS,
                        "timezone": "Asia/Kolkata",
                    },
                )
                r_wx = client.get(
                    OPEN_METEO_FORECAST_URL,
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "past_days": 8,
                        "forecast_days": 1,
                        "daily": WX_DAILY_VARS,
                        "wind_speed_unit": "ms",
                        "timezone": "Asia/Kolkata",
                    },
                )
            if r_aq.status_code == 200 and r_wx.status_code == 200:
                aq_daily = _parse_hourly_aq_to_daily(r_aq.json(), max_date=today_str)
                wx_daily = _parse_daily_weather(r_wx.json(), max_date=today_str)
                if not aq_daily.empty and not wx_daily.empty:
                    merged = pd.merge(aq_daily, wx_daily, on="date", how="inner")
                    merged["AQI"] = merged.apply(compute_daily_aqi, axis=1)
                    merged = (
                        merged.dropna(subset=["AQI", "TEMP", "PRES", "DEWP", "WSPM"])
                        .sort_values("date")
                        .reset_index(drop=True)
                    )
                    if not merged.empty:
                        latest = merged.iloc[-1]
                        prev = merged.iloc[:-1]
                        return {
                            "station": matched["station"] if matched else station_name.strip(),
                            "state": resolved_state,
                            "city": matched["city"] if matched else resolved_state,
                            "lat": lat,
                            "lon": lon,
                            "source": "open-meteo-live",
                            "snapshot": {
                                "station": matched["station"] if matched else station_name.strip(),
                                "state": resolved_state,
                                "date": str(latest["date"]),
                                "AQI": round(float(latest["AQI"]), 1),
                                "PM2.5": round(float(latest["PM2.5"]), 1),
                                "PM10": round(float(latest["PM10"]), 1),
                                "SO2": round(float(latest["SO2"]), 1),
                                "NO2": round(float(latest["NO2"]), 1),
                                "CO_mg": round(float(latest["CO_mg"]), 2),
                                "O3": round(float(latest["O3"]), 1),
                                "TEMP": round(float(latest["TEMP"]), 1),
                                "PRES": round(float(latest["PRES"]), 1),
                                "DEWP": round(float(latest["DEWP"]), 1),
                                "RAIN": round(float(latest["RAIN"]), 1),
                                "WSPM": round(float(latest["WSPM"]), 2),
                                "aqi_lag1": round(
                                    float(prev.iloc[-1]["AQI"]) if len(prev) >= 1 else float(latest["AQI"]),
                                    1,
                                ),
                                "aqi_roll3_mean": round(float(merged.tail(3)["AQI"].mean()), 1),
                                "aqi_roll7_mean": round(float(merged.tail(7)["AQI"].mean()), 1),
                                "wspm_roll3_mean": round(float(merged.tail(3)["WSPM"].mean()), 2),
                            },
                        }
        except Exception:
            pass

    if matched and matched.get("sample_snapshot"):
        snap = dict(matched["sample_snapshot"])
        snap["station"] = matched["station"]
        snap["state"] = matched["state"]
        return {
            "station": matched["station"],
            "state": matched["state"],
            "city": matched["city"],
            "lat": matched["lat"],
            "lon": matched["lon"],
            "source": "cached-snapshot",
            "snapshot": snap,
        }

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No monitoring station readings found for '{station_name}'.",
    )
