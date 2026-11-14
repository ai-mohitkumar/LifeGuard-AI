"""Leakage-safe training pipeline for LifeGuard AI Module 1: Scam Shield.

Trains and compares two independent supervised pipelines:
  1. SMS Text Track: TF-IDF (inside Pipeline) + Dummy, Logistic Regression,
     Calibrated Linear SVM, and Multinomial Naive Bayes.
  2. URL Track: Handcrafted lexical features (URLLexicalFeatureExtractor inside
     Pipeline) + Dummy, Logistic Regression, Random Forest, and XGBoost.

Strict ML guarantees:
  - Exact duplicate texts/URLs are removed BEFORE splitting.
  - Test split (20%) is untouched until final evaluation of the chosen model.
  - All vectorization, imputation, and scaling live inside sklearn Pipelines.
  - URL splits are domain-grouped (StratifiedGroupKFold) to prevent domain leakage.
  - Dual thresholds (threshold_low for 'suspicious', threshold_high for 'scam')
    are tuned strictly on out-of-fold train/validation probabilities using F2-score
    and high-recall safety criteria (missed scam costs more than a false alarm).
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlparse

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    fbeta_score,
    precision_recall_curve,
    precision_score,
    recall_score,
)
from sklearn.model_selection import (
    StratifiedGroupKFold,
    StratifiedKFold,
    cross_val_predict,
    train_test_split,
)
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC
from xgboost import XGBClassifier

# Ensure repo root is on sys.path so joblib pickles reference `ml.scam.features`
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.scam.features import URL_FEATURE_NAMES, URLLexicalFeatureExtractor  # noqa: E402

DATA_DIR = REPO_ROOT / "data" / "scam"
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION = "1.0.0"


def _extract_domain_group(raw_url: str) -> str:
    """Extract normalized hostname to prevent the same domain leaking across splits."""
    text = str(raw_url or "").strip()
    if "://" not in text:
        text = f"http://{text}"
    host = (urlparse(text).hostname or "unknown").lower()
    if host.startswith("www."):
        host = host[4:]
    return host or "unknown"


def load_sms_dataset(sms_path: Path | None = None) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Load UCI SMSSpamCollection or Kaggle spam.csv and remove duplicate texts."""
    if sms_path is None:
        if (DATA_DIR / "SMSSpamCollection").exists():
            sms_path = DATA_DIR / "SMSSpamCollection"
        elif (DATA_DIR / "spam.csv").exists():
            sms_path = DATA_DIR / "spam.csv"
        else:
            raise FileNotFoundError(
                f"No SMS dataset found in {DATA_DIR}. Run `python ml/scam/download_data.py` first."
            )

    if sms_path.suffix.lower() == ".csv":
        raw_df = pd.read_csv(sms_path, encoding="latin-1")
        if {"v1", "v2"}.issubset(raw_df.columns):
            df = raw_df[["v1", "v2"]].rename(columns={"v1": "label", "v2": "text"})
        elif {"label", "text"}.issubset(raw_df.columns):
            df = raw_df[["label", "text"]]
        else:
            raise ValueError(f"Unsupported SMS CSV columns: {list(raw_df.columns)}")
    else:
        df = pd.read_csv(
            sms_path,
            sep="\t",
            header=None,
            names=["label", "text"],
            encoding="utf-8",
            quoting=3,
        )

    raw_rows = len(df)
    df["text"] = df["text"].astype(str).str.strip()
    df["label_norm"] = df["label"].astype(str).str.strip().str.lower()
    label_map = {"ham": 0, "safe": 0, "0": 0, "spam": 1, "scam": 1, "1": 1}
    df["target"] = df["label_norm"].map(label_map)
    df = df.dropna(subset=["text", "target"])
    df = df[df["text"].str.len() > 0].copy()
    df["target"] = df["target"].astype(int)

    # Drop exact duplicate messages before splitting so train/test never share identical texts.
    dedup_df = df.drop_duplicates(subset=["text"]).reset_index(drop=True)
    info = {
        "source_file": sms_path.name,
        "raw_rows": int(raw_rows),
        "deduplicated_rows": int(len(dedup_df)),
        "duplicates_removed": int(raw_rows - len(dedup_df)),
        "scam_rate": round(float(dedup_df["target"].mean()), 4),
    }
    return dedup_df[["text", "target"]], info


def load_url_dataset(
    url_path: Path | None = None,
    url_col: str = "URL",
    label_col: str = "label",
    phishing_label_value: int | str = 0,
    max_rows: int | None = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Load PhiUSIIL Phishing URL Dataset (0=phishing, 1=legitimate) or custom URL CSV."""
    if url_path is None:
        candidates = sorted(DATA_DIR.glob("*PhiUSIIL*.csv")) + sorted(DATA_DIR.glob("*url*.csv"))
        if not candidates:
            raise FileNotFoundError(
                f"No URL dataset CSV found in {DATA_DIR}. Run `python ml/scam/download_data.py` first."
            )
        url_path = candidates[0]

    raw_df = pd.read_csv(url_path, usecols=[url_col, label_col])
    raw_rows = len(raw_df)

    df = raw_df.rename(columns={url_col: "url", label_col: "raw_label"}).dropna().copy()
    df["url"] = df["url"].astype(str).str.strip()
    df = df[df["url"].str.len() > 0]

    # PhiUSIIL convention: 0 = phishing (scam target=1), 1 = legitimate (safe target=0)
    target_match = str(phishing_label_value).strip().lower()
    df["target"] = (df["raw_label"].astype(str).str.strip().str.lower() == target_match).astype(int)

    dedup_df = df.drop_duplicates(subset=["url"]).reset_index(drop=True)
    if max_rows is not None and max_rows < len(dedup_df):
        dedup_df, _ = train_test_split(
            dedup_df,
            train_size=max_rows,
            stratify=dedup_df["target"],
            random_state=42,
        )
        dedup_df = dedup_df.reset_index(drop=True)

    dedup_df["domain_group"] = dedup_df["url"].map(_extract_domain_group)

    info = {
        "source_file": url_path.name,
        "raw_rows": int(raw_rows),
        "deduplicated_rows": int(len(dedup_df)),
        "duplicates_removed": int(raw_rows - len(dedup_df)),
        "unique_domains": int(dedup_df["domain_group"].nunique()),
        "scam_rate": round(float(dedup_df["target"].mean()), 4),
    }
    return dedup_df[["url", "target", "domain_group"]], info


def _compute_binary_metrics(y_true: np.ndarray, y_prob: np.ndarray, threshold: float) -> dict[str, float]:
    """Compute precision, recall, F1, F2, and PR-AUC at a given probability threshold."""
    y_pred = (y_prob >= threshold).astype(int)
    return {
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "f2": round(float(fbeta_score(y_true, y_pred, beta=2.0, zero_division=0)), 4),
        "pr_auc": round(float(average_precision_score(y_true, y_prob)), 4),
    }


def _tune_dual_thresholds(y_true: np.ndarray, oof_probs: np.ndarray) -> tuple[float, float]:
    """Tune threshold_high ('scam') and threshold_low ('suspicious') strictly on OOF probabilities.

    - threshold_high maximizes F2 score (weighing recall 2x precision since missed scams cost more).
    - threshold_low captures high-recall borderline alerts (~97% OOF recall) for the 'suspicious' tier.
    """
    precisions, recalls, thresholds = precision_recall_curve(y_true, oof_probs)
    if len(thresholds) == 0:
        return 0.30, 0.50

    p_cut = precisions[:-1]
    r_cut = recalls[:-1]
    denom = 4.0 * p_cut + r_cut
    f2_scores = np.where(denom > 0, (5.0 * p_cut * r_cut) / denom, 0.0)

    # Restrict search to practical operating thresholds so extreme boundary artifacts aren't chosen.
    valid_mask = (thresholds >= 0.20) & (thresholds <= 0.85)
    if np.any(valid_mask):
        masked_f2 = np.where(valid_mask, f2_scores, -1.0)
        best_idx = int(np.argmax(masked_f2))
    else:
        best_idx = int(np.argmax(f2_scores))

    t_high = float(thresholds[best_idx])

    # Choose lower 'suspicious' threshold where OOF recall >= 0.97 (staying strictly below t_high).
    high_recall_candidates = thresholds[(r_cut >= 0.97) & (thresholds < t_high)]
    if len(high_recall_candidates) > 0:
        t_low = float(np.max(high_recall_candidates))
    else:
        t_low = float(max(0.10, t_high * 0.55))

    t_low = round(min(t_low, t_high - 0.05), 4)
    t_high = round(t_high, 4)
    return max(0.05, t_low), max(0.15, t_high)


def _make_domain_grouped_folds(
    targets: np.ndarray, domains: pd.Series, n_splits: int = 5, seed: int = 42
) -> list[tuple[np.ndarray, np.ndarray]]:
    """Fast domain-grouped stratified fold generator with zero domain overlap across splits."""
    domain_df = pd.DataFrame({"domain": domains.values, "target": targets})
    domain_summary = domain_df.groupby("domain", sort=False)["target"].mean().round().astype(int)
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)

    domain_to_fold: dict[str, int] = {}
    unique_domains = domain_summary.index.to_numpy()
    unique_labels = domain_summary.to_numpy()
    for fold_idx, (_, val_dom_idx) in enumerate(skf.split(unique_domains, unique_labels)):
        for dom in unique_domains[val_dom_idx]:
            domain_to_fold[dom] = fold_idx

    row_folds = domains.map(domain_to_fold).to_numpy()
    folds: list[tuple[np.ndarray, np.ndarray]] = []
    for fold_idx in range(n_splits):
        val_idx = np.where(row_folds == fold_idx)[0]
        train_idx = np.where(row_folds != fold_idx)[0]
        folds.append((train_idx, val_idx))
    return folds


def _evaluate_candidate_cv(
    name: str,
    pipeline: Pipeline,
    X: pd.Series,
    y: np.ndarray,
    splits: list[tuple[np.ndarray, np.ndarray]],
) -> tuple[dict[str, Any], np.ndarray]:
    """Evaluate a candidate Pipeline via precomputed CV folds without any fold leakage."""
    oof_probs = np.zeros(len(y), dtype=np.float64)
    fold_metrics = []

    for train_idx, val_idx in splits:
        X_tr = X.iloc[train_idx]
        y_tr = y[train_idx]
        X_va = X.iloc[val_idx]
        y_va = y[val_idx]

        pipeline.fit(X_tr, y_tr)
        probs = pipeline.predict_proba(X_va)[:, 1]
        oof_probs[val_idx] = probs
        fold_metrics.append(_compute_binary_metrics(y_va, probs, threshold=0.5))

    summary = {
        "model": name,
        "cv_pr_auc_mean": round(float(np.mean([m["pr_auc"] for m in fold_metrics])), 4),
        "cv_pr_auc_std": round(float(np.std([m["pr_auc"] for m in fold_metrics])), 4),
        "cv_f1_mean": round(float(np.mean([m["f1"] for m in fold_metrics])), 4),
        "cv_f2_mean": round(float(np.mean([m["f2"] for m in fold_metrics])), 4),
        "cv_recall_mean": round(float(np.mean([m["recall"] for m in fold_metrics])), 4),
        "cv_precision_mean": round(float(np.mean([m["precision"] for m in fold_metrics])), 4),
    }
    return summary, oof_probs


def _build_error_analysis(
    samples: pd.Series,
    y_true: np.ndarray,
    y_prob: np.ndarray,
    threshold_low: float,
    threshold_high: float,
    sample_key: str,
) -> dict[str, Any]:
    """Summarize confusion matrix and inspect concrete test-set mistakes."""
    y_pred_scam = (y_prob >= threshold_high).astype(int)
    y_pred_alert = (y_prob >= threshold_low).astype(int)

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred_scam, labels=[0, 1]).ravel()
    _, _, fn_alert, _ = confusion_matrix(y_true, y_pred_alert, labels=[0, 1]).ravel()

    fn_indices = np.where((y_true == 1) & (y_pred_scam == 0))[0]
    fp_indices = np.where((y_true == 0) & (y_pred_scam == 1))[0]

    # Sort by most confident mistakes first for meaningful inspection
    fn_sorted = fn_indices[np.argsort(y_prob[fn_indices])][:5]
    fp_sorted = fp_indices[np.argsort(-y_prob[fp_indices])][:5]

    return {
        "confusion_matrix_at_t_high": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
        "missed_scams_even_after_suspicious_band": int(fn_alert),
        "false_negatives_sample": [
            {sample_key: str(samples.iloc[i])[:180], "scam_prob": round(float(y_prob[i]), 4)}
            for i in fn_sorted
        ],
        "false_positives_sample": [
            {sample_key: str(samples.iloc[i])[:180], "scam_prob": round(float(y_prob[i]), 4)}
            for i in fp_sorted
        ],
    }


def train_sms_module(sms_path: Path | None = None) -> dict[str, Any]:
    """Run full leakage-safe training, CV, threshold tuning, and test eval for SMS Scam Shield."""
    df, data_info = load_sms_dataset(sms_path)
    print(f"\n[SMS] Loaded {data_info['deduplicated_rows']} unique SMS messages "
          f"(removed {data_info['duplicates_removed']} exact duplicates, "
          f"scam rate = {data_info['scam_rate']:.1%}).")

    # Hold out 20% stratified test set — untouched until final evaluation
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        df["text"],
        df["target"].to_numpy(),
        test_size=0.20,
        stratify=df["target"].to_numpy(),
        random_state=42,
    )
    X_train_val = X_train_val.reset_index(drop=True)
    X_test = X_test.reset_index(drop=True)

    tfidf_params = dict(
        ngram_range=(1, 2),
        min_df=2,
        max_features=15000,
        sublinear_tf=True,
        stop_words="english",
    )

    candidates: list[tuple[str, Pipeline]] = [
        (
            "Baseline: Dummy (Most Frequent)",
            Pipeline([("clf", DummyClassifier(strategy="most_frequent"))]),
        ),
        (
            "TF-IDF + Logistic Regression",
            Pipeline([
                ("tfidf", TfidfVectorizer(**tfidf_params)),
                ("clf", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)),
            ]),
        ),
        (
            "TF-IDF + Linear SVM (Calibrated)",
            Pipeline([
                ("tfidf", TfidfVectorizer(**tfidf_params)),
                (
                    "clf",
                    CalibratedClassifierCV(
                        LinearSVC(class_weight="balanced", random_state=42),
                        cv=3,
                        method="sigmoid",
                    ),
                ),
            ]),
        ),
        (
            "TF-IDF + Multinomial Naive Bayes",
            Pipeline([
                ("tfidf", TfidfVectorizer(**tfidf_params)),
                ("clf", MultinomialNB(alpha=0.5)),
            ]),
        ),
    ]

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    sms_splits = list(cv.split(X_train_val, y_train_val))
    comparison_table: list[dict[str, Any]] = []
    best_name = ""
    best_pipeline = None
    best_oof = None
    best_score = -1.0

    for name, pipe in candidates:
        summary, oof_probs = _evaluate_candidate_cv(name, pipe, X_train_val, y_train_val, sms_splits)
        comparison_table.append(summary)
        print(
            f"  CV {name:34s} | PR-AUC={summary['cv_pr_auc_mean']:.4f} "
            f"| F1={summary['cv_f1_mean']:.4f} | Recall={summary['cv_recall_mean']:.4f}"
        )
        if not name.startswith("Baseline:") and summary["cv_pr_auc_mean"] > best_score:
            best_score = summary["cv_pr_auc_mean"]
            best_name = name
            best_pipeline = pipe
            best_oof = oof_probs

    assert best_pipeline is not None and best_oof is not None
    t_low, t_high = _tune_dual_thresholds(y_train_val, best_oof)
    print(f"  Selected SMS model: {best_name} | tuned thresholds: suspicious>={t_low}, scam>={t_high}")

    # Final fit on full train_val and single evaluation on untouched test set
    best_pipeline.fit(X_train_val, y_train_val)
    test_probs = best_pipeline.predict_proba(X_test)[:, 1]
    metrics_default = _compute_binary_metrics(y_test, test_probs, threshold=0.50)
    metrics_tuned = _compute_binary_metrics(y_test, test_probs, threshold=t_high)
    alert_recall = round(float(recall_score(y_test, (test_probs >= t_low).astype(int))), 4)

    error_analysis = _build_error_analysis(
        X_test, y_test, test_probs, t_low, t_high, sample_key="text"
    )
    limitations = [
        "Trained on UCI SMS Spam Collection (English messages from 2012); modern slang, regional languages, or newer UPI/OTP phishing templates may cause drift.",
        "Lexical TF-IDF cannot resolve shortened URLs inside SMS messages or verify sender reputation.",
        "Dual-threshold 'suspicious' zone is calibrated on out-of-fold validation probabilities rather than a separate human-labeled 3rd class.",
    ]

    bundle_path = ARTIFACTS_DIR / "sms_scam_bundle.joblib"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": best_pipeline,
        "threshold_low": t_low,
        "threshold_high": t_high,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "sub_model": "sms",
    }
    joblib.dump(bundle, bundle_path)

    return {
        "module": "scam",
        "sub_model": "sms",
        "model_name": best_name,
        "version": MODEL_VERSION,
        "dataset": data_info,
        "splits": {"train_val_rows": int(len(X_train_val)), "test_rows": int(len(X_test))},
        "thresholds": {"suspicious_min": t_low, "scam_min": t_high},
        "metrics": {
            "test_at_0_50": metrics_default,
            "test_at_tuned_scam": metrics_tuned,
            "test_alert_recall_including_suspicious": alert_recall,
            # Top-level summary fields for quick registry display
            "precision": metrics_tuned["precision"],
            "recall": metrics_tuned["recall"],
            "f1": metrics_tuned["f1"],
            "pr_auc": metrics_tuned["pr_auc"],
        },
        "comparison_table": comparison_table,
        "error_analysis": error_analysis,
        "limitations": limitations,
        "artifact_path": str(bundle_path.relative_to(REPO_ROOT).as_posix()),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def train_url_module(
    url_path: Path | None = None,
    max_rows: int | None = None,
) -> dict[str, Any]:
    """Run full leakage-safe, domain-grouped training & evaluation for URL Scam Shield."""
    df, data_info = load_url_dataset(url_path=url_path, max_rows=max_rows)
    print(f"\n[URL] Loaded {data_info['deduplicated_rows']} unique URLs across "
          f"{data_info['unique_domains']} domains (removed {data_info['duplicates_removed']} duplicates, "
          f"phishing rate = {data_info['scam_rate']:.1%}).")

    # Domain-grouped outer split: 80% train_val / 20% untouched test (zero shared domains)
    outer_folds = _make_domain_grouped_folds(
        df["target"].to_numpy(), df["domain_group"], n_splits=5, seed=42
    )
    train_val_idx, test_idx = outer_folds[0]

    X_train_val = df["url"].iloc[train_val_idx].reset_index(drop=True)
    y_train_val = df["target"].to_numpy()[train_val_idx]
    g_train_val = df["domain_group"].iloc[train_val_idx].reset_index(drop=True)

    X_test = df["url"].iloc[test_idx].reset_index(drop=True)
    y_test = df["target"].to_numpy()[test_idx]

    candidates: list[tuple[str, Pipeline]] = [
        (
            "Baseline: Dummy (Most Frequent)",
            Pipeline([("clf", DummyClassifier(strategy="most_frequent"))]),
        ),
        (
            "Lexical + Logistic Regression",
            Pipeline([
                ("extract", URLLexicalFeatureExtractor()),
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("clf", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)),
            ]),
        ),
        (
            "Lexical + Random Forest",
            Pipeline([
                ("extract", URLLexicalFeatureExtractor()),
                ("imputer", SimpleImputer(strategy="median")),
                (
                    "clf",
                    RandomForestClassifier(
                        n_estimators=150,
                        max_depth=16,
                        min_samples_leaf=2,
                        class_weight="balanced_subsample",
                        random_state=42,
                        n_jobs=-1,
                    ),
                ),
            ]),
        ),
        (
            "Lexical + XGBoost",
            Pipeline([
                ("extract", URLLexicalFeatureExtractor()),
                ("imputer", SimpleImputer(strategy="median")),
                (
                    "clf",
                    XGBClassifier(
                        n_estimators=200,
                        max_depth=6,
                        learning_rate=0.08,
                        subsample=0.85,
                        colsample_bytree=0.85,
                        eval_metric="logloss",
                        random_state=42,
                        n_jobs=-1,
                    ),
                ),
            ]),
        ),
    ]

    url_splits = _make_domain_grouped_folds(y_train_val, g_train_val, n_splits=5, seed=42)
    comparison_table: list[dict[str, Any]] = []
    best_name = ""
    best_pipeline = None
    best_oof = None
    best_score = -1.0

    for name, pipe in candidates:
        summary, oof_probs = _evaluate_candidate_cv(
            name, pipe, X_train_val, y_train_val, url_splits
        )
        comparison_table.append(summary)
        print(
            f"  CV {name:34s} | PR-AUC={summary['cv_pr_auc_mean']:.4f} "
            f"| F1={summary['cv_f1_mean']:.4f} | Recall={summary['cv_recall_mean']:.4f}"
        )
        if not name.startswith("Baseline:") and summary["cv_pr_auc_mean"] > best_score:
            best_score = summary["cv_pr_auc_mean"]
            best_name = name
            best_pipeline = pipe
            best_oof = oof_probs

    assert best_pipeline is not None and best_oof is not None
    t_low, t_high = _tune_dual_thresholds(y_train_val, best_oof)
    print(f"  Selected URL model: {best_name} | tuned thresholds: suspicious>={t_low}, scam>={t_high}")

    best_pipeline.fit(X_train_val, y_train_val)
    test_probs = best_pipeline.predict_proba(X_test)[:, 1]
    metrics_default = _compute_binary_metrics(y_test, test_probs, threshold=0.50)
    metrics_tuned = _compute_binary_metrics(y_test, test_probs, threshold=t_high)
    alert_recall = round(float(recall_score(y_test, (test_probs >= t_low).astype(int))), 4)

    error_analysis = _build_error_analysis(
        X_test, y_test, test_probs, t_low, t_high, sample_key="url"
    )
    limitations = [
        "Dataset artifact in PhiUSIIL: 100% of legitimate training URLs use HTTPS (`is_https=1`), so legitimate legacy `http://` URLs are flagged as elevated risk.",
        "Model uses purely lexical URL features (no live webpage scraping, SSL certificate lookup, or WHOIS domain-age check) for safe offline inference.",
        "Lookalike homograph attacks on short HTTPS domains (e.g., `https://paypa1.com`) may look lexically similar to legitimate short domains.",
    ]

    bundle_path = ARTIFACTS_DIR / "url_scam_bundle.joblib"
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "pipeline": best_pipeline,
        "threshold_low": t_low,
        "threshold_high": t_high,
        "model_name": best_name,
        "version": MODEL_VERSION,
        "sub_model": "url",
        "feature_names": URL_FEATURE_NAMES,
    }
    joblib.dump(bundle, bundle_path)

    return {
        "module": "scam",
        "sub_model": "url",
        "model_name": best_name,
        "version": MODEL_VERSION,
        "dataset": data_info,
        "splits": {"train_val_rows": int(len(X_train_val)), "test_rows": int(len(X_test))},
        "thresholds": {"suspicious_min": t_low, "scam_min": t_high},
        "metrics": {
            "test_at_0_50": metrics_default,
            "test_at_tuned_scam": metrics_tuned,
            "test_alert_recall_including_suspicious": alert_recall,
            "precision": metrics_tuned["precision"],
            "recall": metrics_tuned["recall"],
            "f1": metrics_tuned["f1"],
            "pr_auc": metrics_tuned["pr_auc"],
        },
        "comparison_table": comparison_table,
        "error_analysis": error_analysis,
        "limitations": limitations,
        "artifact_path": str(bundle_path.relative_to(REPO_ROOT).as_posix()),
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Scam Shield SMS and URL pipelines.")
    parser.add_argument("--sms-path", type=Path, default=None, help="Optional custom SMS dataset path")
    parser.add_argument("--url-path", type=Path, default=None, help="Optional custom URL CSV path")
    parser.add_argument(
        "--max-url-rows",
        type=int,
        default=None,
        help="Optional stratified cap on URL rows (default: full dataset)",
    )
    args = parser.parse_args()

    sms_meta = train_sms_module(args.sms_path)
    url_meta = train_url_module(args.url_path, max_rows=args.max_url_rows)

    metadata_path = ARTIFACTS_DIR / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump([sms_meta, url_meta], fh, indent=2)

    print(f"\nSaved Scam Shield artifacts and metadata to {ARTIFACTS_DIR}")


if __name__ == "__main__":
    main()
