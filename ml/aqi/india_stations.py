"""All-India State, Union Territory, and CPCB/SPCB monitoring station metadata & lookup helpers."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

ML_AQI_DIR = Path(__file__).resolve().parent
DATA_AQI_DIR = ML_AQI_DIR.parents[1] / "data" / "aqi"
STATION_LOOKUP_PATH = ML_AQI_DIR / "station_lookup.json"
INDIA_STATIONS_PATH = DATA_AQI_DIR / "india_stations.json"

# All 28 States + 8 Union Territories of India (36 total) with capital/anchor coordinates
ALL_INDIA_STATES_AND_UTS: dict[str, dict[str, Any]] = {
    "Andhra Pradesh": {"type": "State", "capital": "Amaravati", "lat": 16.5140, "lon": 80.5160},
    "Arunachal Pradesh": {"type": "State", "capital": "Itanagar", "lat": 27.0844, "lon": 93.6053},
    "Assam": {"type": "State", "capital": "Guwahati", "lat": 26.1445, "lon": 91.7362},
    "Bihar": {"type": "State", "capital": "Patna", "lat": 25.5941, "lon": 85.1376},
    "Chhattisgarh": {"type": "State", "capital": "Raipur", "lat": 21.2514, "lon": 81.6296},
    "Goa": {"type": "State", "capital": "Panaji", "lat": 15.4909, "lon": 73.8278},
    "Gujarat": {"type": "State", "capital": "Gandhinagar", "lat": 23.2156, "lon": 72.6369},
    "Haryana": {"type": "State", "capital": "Gurugram", "lat": 28.4595, "lon": 77.0266},
    "Himachal Pradesh": {"type": "State", "capital": "Shimla", "lat": 31.1048, "lon": 77.1734},
    "Jharkhand": {"type": "State", "capital": "Ranchi", "lat": 23.3441, "lon": 85.3096},
    "Karnataka": {"type": "State", "capital": "Bengaluru", "lat": 12.9716, "lon": 77.5946},
    "Kerala": {"type": "State", "capital": "Thiruvananthapuram", "lat": 8.5241, "lon": 76.9366},
    "Madhya Pradesh": {"type": "State", "capital": "Bhopal", "lat": 23.2599, "lon": 77.4126},
    "Maharashtra": {"type": "State", "capital": "Mumbai", "lat": 19.0760, "lon": 72.8777},
    "Manipur": {"type": "State", "capital": "Imphal", "lat": 24.8170, "lon": 93.9368},
    "Meghalaya": {"type": "State", "capital": "Shillong", "lat": 25.5788, "lon": 91.8933},
    "Mizoram": {"type": "State", "capital": "Aizawl", "lat": 23.7271, "lon": 92.7176},
    "Nagaland": {"type": "State", "capital": "Kohima", "lat": 25.6751, "lon": 94.1086},
    "Odisha": {"type": "State", "capital": "Bhubaneswar", "lat": 20.2961, "lon": 85.8245},
    "Punjab": {"type": "State", "capital": "Ludhiana", "lat": 30.9010, "lon": 75.8573},
    "Rajasthan": {"type": "State", "capital": "Jaipur", "lat": 26.9124, "lon": 75.7873},
    "Sikkim": {"type": "State", "capital": "Gangtok", "lat": 27.3389, "lon": 88.6065},
    "Tamil Nadu": {"type": "State", "capital": "Chennai", "lat": 13.0827, "lon": 80.2707},
    "Telangana": {"type": "State", "capital": "Hyderabad", "lat": 17.3850, "lon": 78.4867},
    "Tripura": {"type": "State", "capital": "Agartala", "lat": 23.8315, "lon": 91.2868},
    "Uttar Pradesh": {"type": "State", "capital": "Lucknow", "lat": 26.8467, "lon": 80.9462},
    "Uttarakhand": {"type": "State", "capital": "Dehradun", "lat": 30.3165, "lon": 78.0322},
    "West Bengal": {"type": "State", "capital": "Kolkata", "lat": 22.5726, "lon": 88.3639},
    # 8 Union Territories
    "Andaman and Nicobar Islands": {"type": "UT", "capital": "Port Blair", "lat": 11.6234, "lon": 92.7265},
    "Chandigarh": {"type": "UT", "capital": "Chandigarh", "lat": 30.7333, "lon": 76.7794},
    "Dadra and Nagar Haveli and Daman and Diu": {"type": "UT", "capital": "Silvassa", "lat": 20.2738, "lon": 73.0192},
    "Delhi": {"type": "UT", "capital": "Delhi", "lat": 28.6139, "lon": 77.2090},
    "Jammu and Kashmir": {"type": "UT", "capital": "Srinagar", "lat": 34.0837, "lon": 74.7973},
    "Ladakh": {"type": "UT", "capital": "Leh", "lat": 34.1526, "lon": 77.5771},
    "Lakshadweep": {"type": "UT", "capital": "Kavaratti", "lat": 10.5669, "lon": 72.6420},
    "Puducherry": {"type": "UT", "capital": "Puducherry", "lat": 11.9416, "lon": 79.8083},
}

# Official / regional stations covering the 7 States & UTs not present in 2017–2023 CPCB CSV archive
# plus major capital / industrial hubs added under NCAP
SUPPLEMENTAL_INDIA_STATIONS: list[dict[str, Any]] = [
    {"state": "Goa", "city": "Panaji", "station": "Patto Centre Panaji GSPCB", "lat": 15.4909, "lon": 73.8278},
    {"state": "Goa", "city": "Vasco da Gama", "station": "Vasco da Gama Vasco GSPCB", "lat": 15.3982, "lon": 73.8113},
    {"state": "Goa", "city": "Margao", "station": "Margao South Goa GSPCB", "lat": 15.2832, "lon": 73.9862},
    {"state": "Nagaland", "city": "Kohima", "station": "PWD Junction Kohima NPCB", "lat": 25.6751, "lon": 94.1086},
    {"state": "Nagaland", "city": "Dimapur", "station": "Dhobinalla Dimapur NPCB", "lat": 25.9091, "lon": 93.7266},
    {"state": "Puducherry", "city": "Puducherry", "station": "Lawspet Puducherry PPCC", "lat": 11.9416, "lon": 79.8083},
    {"state": "Puducherry", "city": "Karaikal", "station": "Karaikal Puducherry PPCC", "lat": 10.9254, "lon": 79.8380},
    {"state": "Ladakh", "city": "Leh", "station": "Main Bazar Leh LPCC", "lat": 34.1526, "lon": 77.5771},
    {"state": "Ladakh", "city": "Kargil", "station": "Kargil Town Ladakh LPCC", "lat": 34.5539, "lon": 76.1349},
    {
        "state": "Andaman and Nicobar Islands",
        "city": "Sri Vijaya Puram",
        "station": "Sri Vijaya Puram Port Blair ANPCC",
        "lat": 11.6234,
        "lon": 92.7265,
    },
    {
        "state": "Dadra and Nagar Haveli and Daman and Diu",
        "city": "Silvassa",
        "station": "Silvassa Industrial Estate DNHDD PCC",
        "lat": 20.2738,
        "lon": 73.0192,
    },
    {
        "state": "Dadra and Nagar Haveli and Daman and Diu",
        "city": "Daman",
        "station": "Nani Daman DNHDD PCC",
        "lat": 20.3974,
        "lon": 72.8328,
    },
    {"state": "Lakshadweep", "city": "Kavaratti", "station": "Kavaratti Island Lakshadweep LPCC", "lat": 10.5669, "lon": 72.6420},
    # Key capital/industrial cities newly expanded under NCAP
    {"state": "Jharkhand", "city": "Ranchi", "station": "Albert Ekka Chowk Ranchi JSPCB", "lat": 23.3441, "lon": 85.3096},
    {"state": "Jharkhand", "city": "Jamshedpur", "station": "Bistupur Jamshedpur JSPCB", "lat": 22.8046, "lon": 86.2029},
    {"state": "Jammu and Kashmir", "city": "Jammu", "station": "Kachehri Road Jammu JKPCB", "lat": 32.7266, "lon": 74.8570},
    {"state": "Himachal Pradesh", "city": "Shimla", "station": "Mall Road Shimla HPPCB", "lat": 31.1048, "lon": 77.1734},
]

# Known industrial / sub-district CPCB city names mapped to accurate local coordinates
KNOWN_CITY_COORDS: dict[tuple[str, str], tuple[float, float]] = {
    ("Assam", "Byrnihat"): (26.0468, 91.8744),
    ("Chhattisgarh", "Chhal"): (22.1040, 83.1440),
    ("Chhattisgarh", "Kunjemura"): (22.1180, 83.4830),
    ("Chhattisgarh", "Tumidih"): (21.9700, 83.3900),
    ("Chhattisgarh", "Milupara"): (22.2400, 83.5200),
    ("Jharkhand", "Jorapokhar"): (23.7040, 86.4130),
    ("Jharkhand", "Pathardih"): (23.6690, 86.4330),
    ("Gujarat", "Nandesari"): (22.4050, 73.0950),
    ("Gujarat", "Vatva"): (22.9610, 72.6330),
    ("Kerala", "Eloor"): (10.0770, 76.3030),
    ("Uttar Pradesh", "Greater Noida"): (28.4744, 77.5040),
    ("Haryana", "Manesar"): (28.3515, 76.9428),
    ("Haryana", "Dharuhera"): (28.2067, 76.7945),
    ("Haryana", "Ballabgarh"): (28.3413, 77.3193),
    ("Madhya Pradesh", "Pithampur"): (22.6130, 75.6820),
    ("Madhya Pradesh", "Mandideep"): (23.0910, 77.5230),
    ("Maharashtra", "Navi Mumbai"): (19.0330, 73.0297),
    ("Maharashtra", "Boisar"): (19.8036, 72.7565),
    ("Maharashtra", "Mahad"): (18.0833, 73.4167),
    ("Odisha", "Talcher"): (20.9493, 85.2335),
    ("Tamil Nadu", "Gummidipoondi"): (13.4060, 80.1110),
    ("Rajasthan", "Bhiwadi"): (28.2102, 76.8606),
}


@lru_cache(maxsize=1)
def load_station_lookup() -> dict[str, dict[str, Any]]:
    """Load the compact station -> {state, city, lat, lon} lookup dictionary if generated."""
    if not STATION_LOOKUP_PATH.exists():
        return {}
    try:
        data = json.loads(STATION_LOOKUP_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def clear_station_lookup_cache() -> None:
    """Clear cached station lookup JSON after regenerating data/artifacts."""
    load_station_lookup.cache_clear()


def resolve_station_geo(station_name: str, state_hint: str | None = None) -> tuple[str, float | None, float | None]:
    """Resolve (state, latitude, longitude) cleanly for any Indian station or fallback test name."""
    cleaned = str(station_name or "").strip()
    lookup = load_station_lookup()
    if cleaned in lookup:
        rec = lookup[cleaned]
        return (
            str(rec.get("state") or state_hint or "Delhi"),
            rec.get("lat"),
            rec.get("lon"),
        )

    # Case-insensitive station name match
    low = cleaned.lower()
    for key, rec in lookup.items():
        if key.lower() == low:
            return (
                str(rec.get("state") or state_hint or "Delhi"),
                rec.get("lat"),
                rec.get("lon"),
            )

    if state_hint and state_hint.strip() in ALL_INDIA_STATES_AND_UTS:
        st = state_hint.strip()
        meta = ALL_INDIA_STATES_AND_UTS[st]
        return st, float(meta["lat"]), float(meta["lon"])

    return (state_hint.strip() if state_hint else "Other"), None, None
