"""Download All-India CPCB station catalog, geocode all Indian States/UTs & cities,
and fetch multi-year Copernicus CAMS air quality + ERA5 meteorology via Open-Meteo.

Outputs:
  1. `data/aqi/daily_air_quality.csv`: Multi-year daily observations across all 36 Indian
     States & Union Territories (~75 flagship CPCB/SPCB stations, ~100k+ daily rows).
  2. `data/aqi/india_stations.json`: Full All-India directory (545+ stations across all 36
     States & UTs) enriched with CPCB historical statistics and latest 14-day snapshots
     + 7-day causal lag context for instant station & All-India predictions.
  3. `ml/aqi/station_lookup.json`: Lightweight checked-in station -> (state, city, lat, lon)
     coordinate dictionary used during training and backend inference.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
from typing import Any

import httpx
import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.aqi.india_stations import (  # noqa: E402
    ALL_INDIA_STATES_AND_UTS,
    KNOWN_CITY_COORDS,
    STATION_LOOKUP_PATH,
    SUPPLEMENTAL_INDIA_STATIONS,
    clear_station_lookup_cache,
)

DATA_DIR = REPO_ROOT / "data" / "aqi"
CPCB_ARCHIVE_URL = "https://github.com/Vonter/india-cpcb-aqi/raw/main/data/cpcb-aqi.csv.gz"
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

AQ_HOURLY_VARS = "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone"
WX_DAILY_VARS = "temperature_2m_mean,dew_point_2m_mean,surface_pressure_mean,rain_sum,wind_speed_10m_mean"

STATE_ALIASES = {
    "nct of delhi": "delhi",
    "national capital territory of delhi": "delhi",
    "orissa": "odisha",
    "uttaranchal": "uttarakhand",
    "pondicherry": "puducherry",
    "jammu & kashmir": "jammu and kashmir",
    "andaman & nicobar": "andaman and nicobar islands",
    "andaman and nicobar": "andaman and nicobar islands",
    "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
    "daman and diu": "dadra and nagar haveli and daman and diu",
}

# CPCB (ug/m3 for PM2.5, PM10, SO2, NO2, O3; mg/m3 for CO) breakpoints:
# Each tuple: (c_low, c_high, i_low, i_high)
CPCB_BREAKPOINTS: dict[str, list[tuple[float, float, float, float]]] = {
    "PM2.5": [
        (0, 30, 0, 50),
        (30, 60, 51, 100),
        (60, 90, 101, 200),
        (90, 120, 201, 300),
        (120, 250, 301, 400),
        (250, 500, 401, 500),
    ],
    "PM10": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 250, 101, 200),
        (250, 350, 201, 300),
        (350, 430, 301, 400),
        (430, 800, 401, 500),
    ],
    "SO2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 380, 101, 200),
        (380, 800, 201, 300),
        (800, 1600, 301, 400),
        (1600, 2400, 401, 500),
    ],
    "NO2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 180, 101, 200),
        (180, 280, 201, 300),
        (280, 400, 301, 400),
        (400, 800, 401, 500),
    ],
    "O3": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 168, 101, 200),
        (168, 208, 201, 300),
        (208, 748, 301, 400),
        (748, 1200, 401, 500),
    ],
    "CO_mg": [
        (0.0, 1.0, 0, 50),
        (1.0, 2.0, 51, 100),
        (2.0, 10.0, 101, 200),
        (10.0, 17.0, 201, 300),
        (17.0, 34.0, 301, 400),
        (34.0, 60.0, 401, 500),
    ],
}


def _sub_index(conc: float, pollutant: str) -> float:
    if np.isnan(conc) or conc < 0:
        return np.nan
    bps = CPCB_BREAKPOINTS[pollutant]
    for c_lo, c_hi, i_lo, i_hi in bps:
        if conc <= c_hi:
            return i_lo + ((i_hi - i_lo) / (c_hi - c_lo)) * (conc - c_lo)
    return 500.0


def compute_daily_aqi(row: pd.Series) -> float:
    """Compute overall CPCB AQI as max sub-index across pollutants (requiring PM + >=3 pollutants)."""
    sub_indices = []
    for col in ("PM2.5", "PM10", "SO2", "NO2", "O3", "CO_mg"):
        val = row.get(col, np.nan)
        if pd.notna(val):
            sub_indices.append(_sub_index(float(val), col))
    has_pm = pd.notna(row.get("PM2.5")) or pd.notna(row.get("PM10"))
    if not has_pm or len(sub_indices) < 3:
        return np.nan
    return round(float(max(sub_indices)), 2)


def aqi_to_category(aqi: float) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Satisfactory"
    if aqi <= 200:
        return "Moderate"
    if aqi <= 300:
        return "Poor"
    if aqi <= 400:
        return "Very Poor"
    return "Severe"


def _request_json_with_retry(
    client: httpx.Client,
    url: str,
    params: dict[str, Any] | None = None,
    retries: int = 7,
    base_delay: float = 2.0,
) -> Any:
    last_exc: Exception | None = None
    endpoint = url.split("/")[-1]
    for attempt in range(retries):
        try:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                if not resp.content or not resp.content.strip():
                    raise ValueError(f"Empty HTTP 200 body from {endpoint}")
                data = resp.json()
                if isinstance(data, dict) and data.get("error"):
                    reason = str(data.get("reason") or "Unknown Open-Meteo error")
                    if "limit" in reason.lower() or "too many" in reason.lower() or "concurrent" in reason.lower():
                        wait_s = min(65.0, 15.0 * (attempt + 1))
                        print(f"  [API limit on {endpoint}: {reason}] sleeping {wait_s:.0f}s (attempt {attempt + 1}/{retries})...")
                        time.sleep(wait_s)
                        last_exc = RuntimeError(reason)
                        continue
                    raise RuntimeError(f"Open-Meteo API error on {endpoint}: {reason}")
                return data
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                wait_s = (
                    min(70.0, float(retry_after) + 1.0)
                    if retry_after and str(retry_after).replace(".", "", 1).isdigit()
                    else min(65.0, 15.0 * (attempt + 1))
                )
                print(f"  [HTTP 429 rate-limit on {endpoint}] sleeping {wait_s:.0f}s (attempt {attempt + 1}/{retries})...")
                time.sleep(wait_s)
                continue
            if resp.status_code in (500, 502, 503, 504):
                wait_s = min(35.0, base_delay * (attempt + 2.0))
                print(f"  [HTTP {resp.status_code} on {endpoint}] sleeping {wait_s:.1f}s (attempt {attempt + 1}/{retries})...")
                time.sleep(wait_s)
                continue
            resp.raise_for_status()
        except httpx.ConnectError as exc:
            # Fail fast when offline / sandbox blocks DNS instead of waiting through retries
            msg = str(exc).lower()
            if "getaddrinfo failed" in msg or "11001" in msg or "name or service not known" in msg:
                raise
            last_exc = exc
            if attempt < retries - 1:
                time.sleep(base_delay * (attempt + 1.5))
        except (httpx.TimeoutException, httpx.TransportError, ValueError, json.JSONDecodeError) as exc:
            last_exc = exc
            if attempt < retries - 1:
                wait_s = min(35.0, base_delay * (attempt + 2.0))
                print(f"  [Retryable {type(exc).__name__} on {endpoint}: {exc}] sleeping {wait_s:.1f}s (attempt {attempt + 1}/{retries})...")
                time.sleep(wait_s)
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                wait_s = min(30.0, base_delay * (attempt + 2.0))
                print(f"  [Request err {type(exc).__name__} on {endpoint}] sleeping {wait_s:.1f}s (attempt {attempt + 1}/{retries})...")
                time.sleep(wait_s)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError(f"Request failed after {retries} retries: {url}")


def _ensure_cpcb_archive(cpcb_path: Path, redownload: bool = False) -> Path:
    if cpcb_path.exists() and not redownload:
        return cpcb_path
    print(f"Downloading CPCB All-India archive from {CPCB_ARCHIVE_URL} ...")
    with httpx.Client(timeout=120.0, follow_redirects=True, headers={"User-Agent": "LifeGuard-AI/1.0"}) as client:
        with client.stream("GET", CPCB_ARCHIVE_URL) as resp:
            resp.raise_for_status()
            tmp = cpcb_path.with_suffix(".tmp")
            with open(tmp, "wb") as fh:
                for chunk in resp.iter_bytes(chunk_size=262_144):
                    fh.write(chunk)
            tmp.replace(cpcb_path)
    return cpcb_path


def _extract_india_station_catalog(cpcb_path: Path) -> pd.DataFrame:
    """Build combined CPCB (529) + Supplemental SPCB/NCAP (17) catalog covering all 36 States/UTs."""
    raw = pd.read_csv(cpcb_path, low_memory=False)
    hour_cols = [c for c in raw.columns if ":" in str(c)]
    raw["daily_aqi"] = raw[hour_cols].apply(pd.to_numeric, errors="coerce").mean(axis=1)
    raw = raw.sort_values(["State", "City", "Station Name", "Date"]).reset_index(drop=True)

    grouped = (
        raw.groupby(["State", "City", "Station Name"], as_index=False)
        .agg(
            cpcb_obs_days=("daily_aqi", "count"),
            cpcb_mean_aqi=("daily_aqi", "mean"),
            cpcb_p90_aqi=("daily_aqi", lambda s: float(np.nanpercentile(s.dropna(), 90)) if s.notna().any() else np.nan),
            cpcb_min_date=("Date", "min"),
            cpcb_max_date=("Date", "max"),
            latest_cpcb_aqi=("daily_aqi", lambda s: float(s.dropna().iloc[-1]) if s.notna().any() else np.nan),
        )
        .rename(columns={"State": "state", "City": "city", "Station Name": "station"})
    )
    grouped["source_type"] = "CPCB"

    existing_names = {str(s).strip().lower() for s in grouped["station"]}
    supp_rows: list[dict[str, Any]] = []
    for item in SUPPLEMENTAL_INDIA_STATIONS:
        st_name = item["station"].strip()
        if st_name.lower() in existing_names:
            continue
        existing_names.add(st_name.lower())
        supp_rows.append(
            {
                "state": item["state"],
                "city": item["city"],
                "station": st_name,
                "cpcb_obs_days": 0,
                "cpcb_mean_aqi": np.nan,
                "cpcb_p90_aqi": np.nan,
                "cpcb_min_date": None,
                "cpcb_max_date": None,
                "latest_cpcb_aqi": np.nan,
                "source_type": "SPCB/NCAP",
                "preset_lat": float(item["lat"]),
                "preset_lon": float(item["lon"]),
            }
        )

    grouped["preset_lat"] = np.nan
    grouped["preset_lon"] = np.nan
    combined = pd.concat([grouped, pd.DataFrame(supp_rows)], ignore_index=True)

    # Validate coverage across all 36 States & Union Territories
    covered = set(combined["state"].dropna().unique())
    missing = set(ALL_INDIA_STATES_AND_UTS.keys()) - covered
    if missing:
        raise RuntimeError(f"Missing States/UTs from catalog: {sorted(missing)}")

    return combined.sort_values(["state", "city", "station"]).reset_index(drop=True)


def _normalize_admin1(text: str | None) -> str:
    if not text:
        return ""
    cleaned = text.strip().lower().replace("&", "and")
    return STATE_ALIASES.get(cleaned, cleaned)


def _geocode_indian_cities(catalog: pd.DataFrame, cache_path: Path) -> pd.DataFrame:
    """Resolve accurate (lat, lon) for every unique (state, city) pair across India."""
    cache: dict[str, list[float]] = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    unique_pairs = catalog[["state", "city", "preset_lat", "preset_lon"]].drop_duplicates(subset=["state", "city"])
    to_fetch: list[tuple[str, str]] = []

    for row in unique_pairs.itertuples(index=False):
        key = f"{row.state}::{row.city}"
        if pd.notna(row.preset_lat) and pd.notna(row.preset_lon):
            cache[key] = [round(float(row.preset_lat), 4), round(float(row.preset_lon), 4)]
        elif (row.state, row.city) in KNOWN_CITY_COORDS:
            lat, lon = KNOWN_CITY_COORDS[(row.state, row.city)]
            cache[key] = [lat, lon]
        elif key not in cache:
            to_fetch.append((row.state, row.city))

    if to_fetch:
        print(f"Geocoding {len(to_fetch)} Indian CPCB cities via Open-Meteo...")
        with httpx.Client(timeout=20.0, headers={"User-Agent": "LifeGuard-AI/1.0"}) as client:
            for idx, (state, city) in enumerate(to_fetch, start=1):
                target_state = _normalize_admin1(state)
                lat_val: float | None = None
                lon_val: float | None = None
                try:
                    geo_data = _request_json_with_retry(
                        client,
                        OPEN_METEO_GEOCODE_URL,
                        params={
                            "name": city,
                            "count": 8,
                            "countryCode": "IN",
                            "language": "en",
                            "format": "json",
                        },
                        retries=3,
                        base_delay=0.6,
                    )
                    candidates = (geo_data.get("results") if isinstance(geo_data, dict) else None) or []
                    # Score candidates inside India bounding box, strongly preferring matching State/UT admin1
                    best_score = -1
                    for cand in candidates:
                        c_lat = float(cand.get("latitude", 0))
                        c_lon = float(cand.get("longitude", 0))
                        if not (6.0 <= c_lat <= 37.5 and 68.0 <= c_lon <= 98.5):
                            continue
                        adm1 = _normalize_admin1(cand.get("admin1"))
                        score = 1
                        if adm1 == target_state or (target_state in adm1) or (adm1 and adm1 in target_state):
                            score += 10
                        if str(cand.get("name", "")).strip().lower() == city.lower():
                            score += 3
                        if score > best_score:
                            best_score = score
                            lat_val, lon_val = round(c_lat, 4), round(c_lon, 4)
                except (httpx.HTTPStatusError, ValueError, KeyError, TypeError, RuntimeError):
                    lat_val, lon_val = None, None

                if lat_val is None or lon_val is None:
                    fallback = ALL_INDIA_STATES_AND_UTS[state]
                    lat_val, lon_val = float(fallback["lat"]), float(fallback["lon"])

                cache[f"{state}::{city}"] = [lat_val, lon_val]
                if idx % 50 == 0:
                    cache_path.write_text(json.dumps(cache, indent=2), encoding="utf-8")
                    print(f"  Geocoded {idx}/{len(to_fetch)} Indian cities...")
                    time.sleep(0.2)

        cache_path.write_text(json.dumps(cache, indent=2), encoding="utf-8")

    lats = []
    lons = []
    for row in catalog.itertuples(index=False):
        if pd.notna(row.preset_lat) and pd.notna(row.preset_lon):
            lats.append(round(float(row.preset_lat), 4))
            lons.append(round(float(row.preset_lon), 4))
        else:
            coords = cache.get(f"{row.state}::{row.city}") or [
                ALL_INDIA_STATES_AND_UTS[row.state]["lat"],
                ALL_INDIA_STATES_AND_UTS[row.state]["lon"],
            ]
            lats.append(float(coords[0]))
            lons.append(float(coords[1]))

    out = catalog.copy()
    out["lat"] = lats
    out["lon"] = lons
    return out


def _select_training_anchors(catalog: pd.DataFrame, max_stations: int = 76) -> pd.DataFrame:
    """Select flagship monitoring stations guaranteeing coverage of ALL 36 States & Union Territories."""
    ordered = catalog.sort_values(["cpcb_obs_days", "station"], ascending=[False, True]).reset_index(drop=True)

    selected_indices: list[int] = []
    used_cities: set[tuple[str, str]] = set()

    # Pass 1: Mandatory flagship station per State & UT (36 guaranteed)
    for state in sorted(ALL_INDIA_STATES_AND_UTS.keys()):
        sub = ordered[ordered["state"] == state]
        if sub.empty:
            continue
        row = sub.iloc[0]
        selected_indices.append(int(sub.index[0]))
        used_cities.add((str(row["state"]), str(row["city"])))

    # Pass 2: Add diverse regional cities in high-population / diverse-climate states (strictly unique cities first)
    tier_idx = 0
    per_state_groups = {
        state: grp.drop_duplicates(subset=["city"]).reset_index()
        for state, grp in ordered.groupby("state")
    }
    while len(selected_indices) < max_stations:
        added_this_round = False
        tier_idx += 1
        # Sort states by total CPCB station count descending so large states (UP, MH, RJ, TN, MP, WB, GJ, HR, KA) get balanced extra anchors
        states_by_size = sorted(
            per_state_groups.keys(),
            key=lambda st: (len(ordered[ordered["state"] == st]), st),
            reverse=True,
        )
        for state in states_by_size:
            if len(selected_indices) >= max_stations:
                break
            grp = per_state_groups[state]
            if tier_idx >= len(grp):
                continue
            cand = grp.iloc[tier_idx]
            city_key = (str(cand["state"]), str(cand["city"]))
            if city_key in used_cities:
                continue
            used_cities.add(city_key)
            selected_indices.append(int(cand["index"]))
            added_this_round = True
        if not added_this_round:
            break

    anchors = ordered.loc[selected_indices].sort_values(["state", "city", "station"]).reset_index(drop=True)
    return anchors


def _parse_hourly_aq_to_daily(item: dict[str, Any], max_date: str | None = None) -> pd.DataFrame:
    hourly = item.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        return pd.DataFrame()
    n_obs = len(times)
    hdf = pd.DataFrame(
        {
            "date": [str(t)[:10] for t in times],
            "PM2.5": pd.to_numeric(hourly.get("pm2_5") or [np.nan] * n_obs, errors="coerce"),
            "PM10": pd.to_numeric(hourly.get("pm10") or [np.nan] * n_obs, errors="coerce"),
            "NO2": pd.to_numeric(hourly.get("nitrogen_dioxide") or [np.nan] * n_obs, errors="coerce"),
            "SO2": pd.to_numeric(hourly.get("sulphur_dioxide") or [np.nan] * n_obs, errors="coerce"),
            "CO": pd.to_numeric(hourly.get("carbon_monoxide") or [np.nan] * n_obs, errors="coerce"),
            "O3": pd.to_numeric(hourly.get("ozone") or [np.nan] * n_obs, errors="coerce"),
        }
    )
    if max_date is not None:
        hdf = hdf[hdf["date"] <= max_date]
    if hdf.empty:
        return pd.DataFrame()
    daily = (
        hdf.groupby("date", as_index=False)
        .agg(
            {
                "PM2.5": "mean",
                "PM10": "mean",
                "SO2": "mean",
                "NO2": "mean",
                "CO": "mean",
                "O3": "max",
            }
        )
        .sort_values("date")
        .reset_index(drop=True)
    )
    daily["CO_mg"] = daily["CO"] / 1000.0
    return daily


def _parse_daily_weather(item: dict[str, Any], max_date: str | None = None) -> pd.DataFrame:
    daily = item.get("daily") or {}
    units = item.get("daily_units") or {}
    dates = daily.get("time") or []
    if not dates:
        return pd.DataFrame()
    n_days = len(dates)
    wind = pd.to_numeric(daily.get("wind_speed_10m_mean") or [np.nan] * n_days, errors="coerce")
    if str(units.get("wind_speed_10m_mean", "")).lower() == "km/h":
        wind = wind / 3.6
    rain = pd.to_numeric(daily.get("rain_sum") or [0.0] * n_days, errors="coerce")
    wdf = pd.DataFrame(
        {
            "date": [str(d)[:10] for d in dates],
            "TEMP": pd.to_numeric(daily.get("temperature_2m_mean") or [np.nan] * n_days, errors="coerce"),
            "DEWP": pd.to_numeric(daily.get("dew_point_2m_mean") or [np.nan] * n_days, errors="coerce"),
            "PRES": pd.to_numeric(daily.get("surface_pressure_mean") or [np.nan] * n_days, errors="coerce"),
            "RAIN": np.nan_to_num(rain, nan=0.0),
            "WSPM": wind,
        }
    )
    if max_date is not None:
        wdf = wdf[wdf["date"] <= max_date]
    return wdf.sort_values("date").reset_index(drop=True)


def _fetch_multiyear_training_data(anchors: pd.DataFrame, start_date: str, end_date: str) -> pd.DataFrame:
    """Fetch multi-year Open-Meteo AQ + ERA5 Archive Weather across all 36 States/UTs with incremental caching."""
    cache_dir = DATA_DIR / "anchor_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    frames: list[pd.DataFrame] = []
    missing_rows: list[pd.Series] = []
    cache_paths: dict[str, Path] = {}

    for _, row in anchors.iterrows():
        key = hashlib.md5(f"{row['station']}::{start_date}::{end_date}".encode("utf-8")).hexdigest()[:12]
        cpath = cache_dir / f"{key}.csv"
        cache_paths[str(row["station"])] = cpath
        if cpath.exists():
            try:
                cached = pd.read_csv(cpath)
                if not cached.empty:
                    frames.append(cached)
                    continue
            except Exception:
                pass
        missing_rows.append(row)

    if frames:
        print(f"Loaded {len(frames)}/{len(anchors)} cached anchor stations ({sum(len(f) for f in frames):,} rows).")

    if missing_rows:
        todo_df = pd.DataFrame(missing_rows).reset_index(drop=True)
        batch_size = 4
        total_batches = (len(todo_df) + batch_size - 1) // batch_size
        print(
            f"Fetching {start_date} -> {end_date} daily AQ + weather for {len(todo_df)} anchor stations "
            f"across {anchors['state'].nunique()} States/UTs ({total_batches} batches)..."
        )

        with httpx.Client(timeout=45.0, headers={"User-Agent": "LifeGuard-AI/1.0"}) as client:
            for b_idx in range(0, len(todo_df), batch_size):
                batch = todo_df.iloc[b_idx : b_idx + batch_size].reset_index(drop=True)
                lat_param = ",".join(f"{lat:.4f}" for lat in batch["lat"])
                lon_param = ",".join(f"{lon:.4f}" for lon in batch["lon"])

                aq_json = _request_json_with_retry(
                    client,
                    OPEN_METEO_AQ_URL,
                    params={
                        "latitude": lat_param,
                        "longitude": lon_param,
                        "start_date": start_date,
                        "end_date": end_date,
                        "hourly": AQ_HOURLY_VARS,
                        "timezone": "Asia/Kolkata",
                    },
                )
                aq_items = aq_json if isinstance(aq_json, list) else [aq_json]

                time.sleep(0.5)
                wx_json = _request_json_with_retry(
                    client,
                    OPEN_METEO_ARCHIVE_URL,
                    params={
                        "latitude": lat_param,
                        "longitude": lon_param,
                        "start_date": start_date,
                        "end_date": end_date,
                        "daily": WX_DAILY_VARS,
                        "wind_speed_unit": "ms",
                        "timezone": "Asia/Kolkata",
                    },
                )
                wx_items = wx_json if isinstance(wx_json, list) else [wx_json]

                for st_row, aq_item, wx_item in zip(batch.itertuples(index=False), aq_items, wx_items):
                    aq_daily = _parse_hourly_aq_to_daily(aq_item, max_date=end_date)
                    wx_daily = _parse_daily_weather(wx_item, max_date=end_date)
                    if aq_daily.empty or wx_daily.empty:
                        continue
                    merged = pd.merge(aq_daily, wx_daily, on="date", how="inner")
                    merged["station"] = st_row.station
                    merged["state"] = st_row.state
                    merged["city"] = st_row.city
                    merged["latitude"] = round(float(st_row.lat), 4)
                    merged["longitude"] = round(float(st_row.lon), 4)
                    merged["AQI"] = merged.apply(compute_daily_aqi, axis=1)
                    merged = merged.dropna(subset=["AQI", "TEMP", "PRES", "DEWP", "WSPM"]).reset_index(drop=True)
                    if not merged.empty:
                        merged["AQI_Category"] = merged["AQI"].apply(aqi_to_category)
                        merged.to_csv(cache_paths[str(st_row.station)], index=False)
                        frames.append(merged)

                batch_num = b_idx // batch_size + 1
                print(f"  Batch {batch_num}/{total_batches} complete ({sum(len(f) for f in frames):,} station-day rows so far)")
                if batch_num < total_batches:
                    time.sleep(2.2)

    if not frames:
        raise RuntimeError("No historical India AQ/Weather records were retrieved.")

    full = pd.concat(frames, ignore_index=True)
    col_order = [
        "station",
        "state",
        "city",
        "latitude",
        "longitude",
        "date",
        "PM2.5",
        "PM10",
        "SO2",
        "NO2",
        "CO",
        "O3",
        "TEMP",
        "PRES",
        "DEWP",
        "RAIN",
        "WSPM",
        "CO_mg",
        "AQI",
        "AQI_Category",
    ]
    full = full[col_order].sort_values(["date", "state", "station"]).reset_index(drop=True)
    return full


def _fetch_all_city_recent_snapshots(catalog: pd.DataFrame) -> dict[tuple[str, str], dict[str, Any]]:
    """Fetch latest 10-day Open-Meteo AQ + Weather + causal lags for ALL ~259 Indian cities."""
    unique_cities = (
        catalog[["state", "city", "lat", "lon"]]
        .drop_duplicates(subset=["state", "city"])
        .sort_values(["state", "city"])
        .reset_index(drop=True)
    )
    today_str = date.today().isoformat()
    snap_cache_path = DATA_DIR / "recent_city_snapshots_cache.json"
    snapshots: dict[tuple[str, str], dict[str, Any]] = {}
    if snap_cache_path.exists():
        try:
            raw_cache = json.loads(snap_cache_path.read_text(encoding="utf-8"))
            if raw_cache.get("date") == today_str:
                for key, val in (raw_cache.get("cities") or {}).items():
                    st, ct = key.split("::", 1)
                    snapshots[(st, ct)] = val
        except Exception:
            snapshots = {}

    todo_df = unique_cities[
        [
            (str(r.state), str(r.city)) not in snapshots
            for r in unique_cities.itertuples(index=False)
        ]
    ].reset_index(drop=True)
    if snapshots:
        print(f"Loaded {len(snapshots)}/{len(unique_cities)} cached city snapshots for {today_str}.")

    batch_size = 10
    total_batches = (len(todo_df) + batch_size - 1) // batch_size
    if len(todo_df) > 0:
        print(f"Fetching latest 10-day snapshot & causal lags across {len(todo_df)} Indian cities ({total_batches} batches)...")

    with httpx.Client(timeout=45.0, headers={"User-Agent": "LifeGuard-AI/1.0"}) as client:
        for b_idx in range(0, len(todo_df), batch_size):
            batch = todo_df.iloc[b_idx : b_idx + batch_size].reset_index(drop=True)
            lat_param = ",".join(f"{lat:.4f}" for lat in batch["lat"])
            lon_param = ",".join(f"{lon:.4f}" for lon in batch["lon"])

            aq_json = _request_json_with_retry(
                client,
                OPEN_METEO_AQ_URL,
                params={
                    "latitude": lat_param,
                    "longitude": lon_param,
                    "past_days": 10,
                    "forecast_days": 1,
                    "hourly": AQ_HOURLY_VARS,
                    "timezone": "Asia/Kolkata",
                },
            )
            aq_items = aq_json if isinstance(aq_json, list) else [aq_json]

            time.sleep(0.35)
            wx_json = _request_json_with_retry(
                client,
                OPEN_METEO_FORECAST_URL,
                params={
                    "latitude": lat_param,
                    "longitude": lon_param,
                    "past_days": 10,
                    "forecast_days": 1,
                    "daily": WX_DAILY_VARS,
                    "wind_speed_unit": "ms",
                    "timezone": "Asia/Kolkata",
                },
            )
            wx_items = wx_json if isinstance(wx_json, list) else [wx_json]

            for c_row, aq_item, wx_item in zip(batch.itertuples(index=False), aq_items, wx_items):
                aq_daily = _parse_hourly_aq_to_daily(aq_item, max_date=today_str)
                wx_daily = _parse_daily_weather(wx_item, max_date=today_str)
                if aq_daily.empty or wx_daily.empty:
                    continue
                merged = pd.merge(aq_daily, wx_daily, on="date", how="inner")
                merged["AQI"] = merged.apply(compute_daily_aqi, axis=1)
                merged = merged.dropna(subset=["AQI", "TEMP", "PRES", "DEWP", "WSPM"]).sort_values("date").reset_index(drop=True)
                if merged.empty:
                    continue

                latest = merged.iloc[-1]
                prev_rows = merged.iloc[:-1]
                aqi_lag1 = float(prev_rows.iloc[-1]["AQI"]) if len(prev_rows) >= 1 else float(latest["AQI"])
                aqi_roll3 = float(merged.tail(3)["AQI"].mean())
                aqi_roll7 = float(merged.tail(7)["AQI"].mean())
                wspm_roll3 = float(merged.tail(3)["WSPM"].mean())

                snapshots[(str(c_row.state), str(c_row.city))] = {
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
                    "aqi_lag1": round(aqi_lag1, 1),
                    "aqi_roll3_mean": round(aqi_roll3, 1),
                    "aqi_roll7_mean": round(aqi_roll7, 1),
                    "wspm_roll3_mean": round(wspm_roll3, 2),
                }

            batch_num = b_idx // batch_size + 1
            snap_cache_path.write_text(
                json.dumps(
                    {
                        "date": today_str,
                        "cities": {f"{st}::{ct}": val for (st, ct), val in snapshots.items()},
                    }
                ),
                encoding="utf-8",
            )
            print(f"  Snapshot batch {batch_num}/{total_batches} complete ({len(snapshots)}/{len(unique_cities)} cities)")
            if batch_num < total_batches:
                time.sleep(0.8)

    return snapshots


def build_india_datasets(
    refresh: bool = False,
    redownload_cpcb: bool = False,
    start_date: str = "2023-01-01",
    end_date: str | None = None,
) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    csv_dest = DATA_DIR / "daily_air_quality.csv"
    stations_dest = DATA_DIR / "india_stations.json"
    cpcb_path = DATA_DIR / "cpcb-aqi.csv.gz"
    coords_cache_path = DATA_DIR / "city_coords_cache.json"

    if not refresh and csv_dest.exists() and stations_dest.exists() and STATION_LOOKUP_PATH.exists():
        print(f"Already present: {csv_dest}, {stations_dest}, and {STATION_LOOKUP_PATH}")
        return

    resolved_end = end_date or (date.today() - timedelta(days=6)).isoformat()
    _ensure_cpcb_archive(cpcb_path, redownload=redownload_cpcb)

    catalog = _extract_india_station_catalog(cpcb_path)
    catalog = _geocode_indian_cities(catalog, coords_cache_path)

    # Save checked-in compact station lookup dictionary for ML feature extractor & inference
    station_lookup: dict[str, dict[str, Any]] = {}
    for row in catalog.itertuples(index=False):
        station_lookup[str(row.station)] = {
            "state": str(row.state),
            "city": str(row.city),
            "lat": round(float(row.lat), 4),
            "lon": round(float(row.lon), 4),
        }
    STATION_LOOKUP_PATH.write_text(json.dumps(station_lookup, indent=2), encoding="utf-8")
    clear_station_lookup_cache()
    print(f"Saved {STATION_LOOKUP_PATH.name}: {len(station_lookup)} Indian stations across {catalog['state'].nunique()} States/UTs.")

    # Select flagship stations across ALL 36 States & UTs and download multi-year training series
    anchors = _select_training_anchors(catalog, max_stations=76)
    daily_df = _fetch_multiyear_training_data(anchors, start_date=start_date, end_date=resolved_end)
    daily_df.to_csv(csv_dest, index=False)
    print(
        f"Saved {csv_dest.name}: {len(daily_df):,} station-day rows across "
        f"{daily_df['station'].nunique()} stations and {daily_df['state'].nunique()} States/UTs "
        f"({daily_df['date'].min()} -> {daily_df['date'].max()})"
    )
    print("Category distribution:", daily_df["AQI_Category"].value_counts().to_dict())

    # Build All-India 546-station directory with latest snapshots & CPCB history metadata
    city_snapshots = _fetch_all_city_recent_snapshots(catalog)

    # Fallback snapshot if any city happened to return empty (derive cleanly from state anchor row in daily_df)
    state_fallback_snap: dict[str, dict[str, Any]] = {}
    for st_name, grp in daily_df.sort_values("date").groupby("state"):
        tail = grp.tail(7)
        last = tail.iloc[-1]
        state_fallback_snap[str(st_name)] = {
            "date": str(last["date"]),
            "AQI": round(float(last["AQI"]), 1),
            "PM2.5": round(float(last["PM2.5"]), 1),
            "PM10": round(float(last["PM10"]), 1),
            "SO2": round(float(last["SO2"]), 1),
            "NO2": round(float(last["NO2"]), 1),
            "CO_mg": round(float(last["CO_mg"]), 2),
            "O3": round(float(last["O3"]), 1),
            "TEMP": round(float(last["TEMP"]), 1),
            "PRES": round(float(last["PRES"]), 1),
            "DEWP": round(float(last["DEWP"]), 1),
            "RAIN": round(float(last["RAIN"]), 1),
            "WSPM": round(float(last["WSPM"]), 2),
            "aqi_lag1": round(float(tail.iloc[-2]["AQI"]) if len(tail) >= 2 else float(last["AQI"]), 1),
            "aqi_roll3_mean": round(float(tail.tail(3)["AQI"].mean()), 1),
            "aqi_roll7_mean": round(float(tail["AQI"].mean()), 1),
            "wspm_roll3_mean": round(float(tail.tail(3)["WSPM"].mean()), 2),
        }

    station_records: list[dict[str, Any]] = []
    anchor_set = set(anchors["station"].tolist())
    for row in catalog.itertuples(index=False):
        snap = city_snapshots.get((str(row.state), str(row.city))) or state_fallback_snap.get(str(row.state))
        if not snap:
            continue
        station_records.append(
            {
                "station": str(row.station),
                "state": str(row.state),
                "city": str(row.city),
                "lat": round(float(row.lat), 4),
                "lon": round(float(row.lon), 4),
                "source_type": str(row.source_type),
                "is_training_anchor": str(row.station) in anchor_set,
                "cpcb_obs_days": int(row.cpcb_obs_days),
                "cpcb_mean_aqi": round(float(row.cpcb_mean_aqi), 1) if pd.notna(row.cpcb_mean_aqi) else None,
                "cpcb_p90_aqi": round(float(row.cpcb_p90_aqi), 1) if pd.notna(row.cpcb_p90_aqi) else None,
                "latest_cpcb_aqi": round(float(row.latest_cpcb_aqi), 1) if pd.notna(row.latest_cpcb_aqi) else None,
                "cpcb_max_date": str(row.cpcb_max_date) if pd.notna(row.cpcb_max_date) else None,
                "sample_snapshot": snap,
            }
        )

    states_summary: list[dict[str, Any]] = []
    for state_name in sorted(ALL_INDIA_STATES_AND_UTS.keys()):
        meta = ALL_INDIA_STATES_AND_UTS[state_name]
        st_rows = [r for r in station_records if r["state"] == state_name]
        cities = sorted({r["city"] for r in st_rows})
        states_summary.append(
            {
                "state": state_name,
                "type": meta["type"],
                "capital": meta["capital"],
                "station_count": len(st_rows),
                "city_count": len(cities),
            }
        )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_states": len(states_summary),
        "total_stations": len(station_records),
        "total_cities": len({(r["state"], r["city"]) for r in station_records}),
        "states": states_summary,
        "stations": station_records,
    }
    stations_dest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"Saved {stations_dest.name}: {payload['total_stations']} Indian monitoring stations "
        f"across {payload['total_cities']} cities in all {payload['total_states']} States & UTs."
    )


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    parser = argparse.ArgumentParser(description="Build All-India Air Aware datasets across all 36 States & UTs.")
    parser.add_argument("--refresh", action="store_true", help="Rebuild CSV/JSON even if already present.")
    parser.add_argument("--redownload-cpcb", action="store_true", help="Re-download raw cpcb-aqi.csv.gz.")
    parser.add_argument("--start-date", default="2023-01-01")
    parser.add_argument("--end-date", default=None)
    args = parser.parse_args()
    build_india_datasets(
        refresh=args.refresh,
        redownload_cpcb=args.redownload_cpcb,
        start_date=args.start_date,
        end_date=args.end_date,
    )


if __name__ == "__main__":
    main()
