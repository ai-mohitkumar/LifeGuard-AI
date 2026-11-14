"""Evaluation & inspection utility for trained Scam Shield models."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import joblib
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def print_report() -> None:
    """Display saved CV comparison tables, test metrics, error analysis, and limitations."""
    meta_path = ARTIFACTS_DIR / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing {meta_path}. Run `python ml/scam/train.py` first.")

    entries = json.loads(meta_path.read_text(encoding="utf-8"))
    for entry in entries:
        print("=" * 78)
        print(f"SCAM SHIELD — {entry['sub_model'].upper()} TRACK ({entry['model_name']} v{entry['version']})")
        print("=" * 78)
        print("Dataset:", entry["dataset"])
        print("Splits :", entry["splits"])
        print("Thresholds:", entry["thresholds"])
        print("\nCross-Validation Model Comparison:")
        print(pd.DataFrame(entry["comparison_table"]).to_string(index=False))
        print("\nUntouched Test Metrics:")
        print("  At default 0.50:", entry["metrics"]["test_at_0_50"])
        print("  At tuned t_high:", entry["metrics"]["test_at_tuned_scam"])
        print("  Alert recall (suspicious+scam):", entry["metrics"]["test_alert_recall_including_suspicious"])
        print("\nConfusion Matrix (at t_high):", entry["error_analysis"]["confusion_matrix_at_t_high"])
        print("\nSample False Negatives:", entry["error_analysis"]["false_negatives_sample"][:3])
        print("Sample False Positives:", entry["error_analysis"]["false_positives_sample"][:3])
        print("\nLimitations:")
        for lim in entry["limitations"]:
            print(f"  - {lim}")
        print()


def score_samples(sms_text: str | None, url_text: str | None) -> None:
    """Score ad-hoc SMS or URL inputs using the saved joblib bundles."""
    if sms_text:
        bundle = joblib.load(ARTIFACTS_DIR / "sms_scam_bundle.joblib")
        prob = float(bundle["pipeline"].predict_proba([sms_text])[0, 1])
        label = (
            "scam"
            if prob >= bundle["threshold_high"]
            else "suspicious"
            if prob >= bundle["threshold_low"]
            else "safe"
        )
        print(f"[SMS] prob={prob:.4f} -> {label.upper()} (t_low={bundle['threshold_low']}, t_high={bundle['threshold_high']})")

    if url_text:
        bundle = joblib.load(ARTIFACTS_DIR / "url_scam_bundle.joblib")
        prob = float(bundle["pipeline"].predict_proba([url_text])[0, 1])
        label = (
            "scam"
            if prob >= bundle["threshold_high"]
            else "suspicious"
            if prob >= bundle["threshold_low"]
            else "safe"
        )
        print(f"[URL] prob={prob:.4f} -> {label.upper()} (t_low={bundle['threshold_low']}, t_high={bundle['threshold_high']})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect Scam Shield evaluation report or score samples.")
    parser.add_argument("--sms", type=str, default=None, help="Optional SMS string to score")
    parser.add_argument("--url", type=str, default=None, help="Optional URL string to score")
    args = parser.parse_args()

    if args.sms or args.url:
        score_samples(args.sms, args.url)
    else:
        print_report()


if __name__ == "__main__":
    main()
