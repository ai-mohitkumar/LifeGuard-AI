"""Evaluation & inspection utility for trained Fair Price models."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def print_report() -> None:
    meta_path = ARTIFACTS_DIR / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing {meta_path}. Run `python ml/price/train.py` first.")

    entries = json.loads(meta_path.read_text(encoding="utf-8"))
    for entry in entries:
        print("=" * 78)
        print(f"FAIR PRICE - {entry['sub_model'].upper()} TRACK ({entry['model_name']} v{entry['version']})")
        print("=" * 78)
        print("Dataset:", entry["dataset"])
        print("Splits :", entry["splits"])
        print("\nCross-Validation Model Comparison:")
        print(pd.DataFrame(entry["comparison_table"]).to_string(index=False))
        print("\nUntouched Test Metrics:", entry["metrics"])
        print("Error Analysis (Tier MAE):", entry["error_analysis"]["tier_mae"])
        print("Worst Residuals Sample:", entry["error_analysis"]["worst_residuals_sample"][:3])
        print("\nLimitations:")
        for lim in entry["limitations"]:
            print(f"  - {lim}")
        print()


if __name__ == "__main__":
    print_report()
