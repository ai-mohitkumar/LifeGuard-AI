"""Evaluation & inspection utility for trained Air Aware AQI forecasting models."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def print_report() -> None:
    meta_path = ARTIFACTS_DIR / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing {meta_path}. Run `python ml/aqi/train.py` first.")

    entries = json.loads(meta_path.read_text(encoding="utf-8"))
    for entry in entries:
        print("=" * 78)
        print(f"AIR AWARE - {entry['sub_model'].upper()} TRACK ({entry['model_name']} v{entry['version']})")
        print("=" * 78)
        print("Dataset   :", entry["dataset"])
        print("Splits    :", entry["splits"])
        print("Thresholds:", entry["thresholds"])
        print("\nChronological Expanding-Window CV Comparison:")
        print(pd.DataFrame(entry["comparison_table"]).to_string(index=False))
        print("\nUntouched Future Test Metrics:", entry["metrics"])
        print("Error Analysis              :", entry["error_analysis"])
        print("\nLimitations:")
        for lim in entry["limitations"]:
            print(f"  - {lim}")
        print()


if __name__ == "__main__":
    print_report()
