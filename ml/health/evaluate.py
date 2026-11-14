"""Evaluation & inspection utility for trained Health Check screening models."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def print_report() -> None:
    meta_path = ARTIFACTS_DIR / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing {meta_path}. Run `python ml/health/train.py` first.")

    entries = json.loads(meta_path.read_text(encoding="utf-8"))
    for entry in entries:
        print("=" * 78)
        print(f"HEALTH CHECK - {entry['sub_model'].upper()} TRACK ({entry['model_name']} v{entry['version']})")
        print("=" * 78)
        print("Disclaimer:", entry["disclaimer"])
        print("Dataset   :", entry["dataset"])
        print("Splits    :", entry["splits"])
        print("Thresholds:", entry["thresholds"])
        print("\nStratified 5-Fold CV Comparison:")
        print(pd.DataFrame(entry["comparison_table"]).to_string(index=False))
        print("\nUntouched Test (0.50) :", entry["metrics"]["test_at_0_50"])
        print("Untouched Test (tuned):", entry["metrics"]["test_at_tuned_elevated"])
        print("Alert Recall (moderate+elevated):", entry["metrics"]["test_alert_recall_including_moderate"])
        print("Test Calibration Curve:", entry["metrics"]["calibration_curve_test"])
        print("Error Analysis        :", entry["error_analysis"]["confusion_matrix_at_t_high"])
        print("\nLimitations:")
        for lim in entry["limitations"]:
            print(f"  - {lim}")
        print()


if __name__ == "__main__":
    print_report()
