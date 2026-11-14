"""Leakage-safe lexical feature extractor for URL phishing detection.

Keeping this transformer in an importable module (`ml.scam.features`) ensures
scikit-learn Pipelines serialized with joblib can be loaded cleanly by FastAPI.
"""

from __future__ import annotations

import ipaddress
import re
from typing import Iterable
from urllib.parse import urlparse

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

SUSPICIOUS_KEYWORDS = (
    "login",
    "signin",
    "verify",
    "update",
    "secure",
    "account",
    "banking",
    "confirm",
    "password",
    "wallet",
    "suspend",
    "urgent",
    "free",
    "bonus",
    "prize",
    "claim",
)

URL_FEATURE_NAMES = [
    "url_length",
    "hostname_length",
    "path_length",
    "num_dots",
    "has_at_symbol",
    "is_https",
    "digits_ratio",
    "subdomain_count",
    "has_ip_address",
    "num_hyphens",
    "num_special_chars",
    "suspicious_keyword_count",
]


_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_IPV4_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


def _normalize_url(raw_url: str) -> str:
    """Ensure URL has a scheme so urlparse correctly isolates hostname and path."""
    text = str(raw_url or "").strip()
    if not text:
        return "http://invalid"
    if not _SCHEME_RE.match(text):
        return f"http://{text}"
    return text


def _is_ip_host(hostname: str) -> bool:
    """Return True if the hostname is a literal IPv4/IPv6 address (without slow exceptions)."""
    clean = hostname.strip("[]")
    if not clean:
        return False
    if _IPV4_RE.match(clean):
        return all(int(octet) <= 255 for octet in clean.split("."))
    if ":" not in clean:
        return False
    try:
        ipaddress.ip_address(clean)
        return True
    except ValueError:
        return False


def extract_single_url_features(raw_url: str) -> list[float]:
    """Compute handcrafted lexical features for one URL without network calls."""
    text = str(raw_url or "").strip()
    normalized = _normalize_url(text)
    parsed = urlparse(normalized)

    hostname = (parsed.hostname or "").lower()
    path_and_query = (parsed.path or "") + (f"?{parsed.query}" if parsed.query else "")

    url_len = float(len(text))
    host_len = float(len(hostname))
    path_len = float(len(path_and_query))
    num_dots = float(text.count("."))
    has_at = 1.0 if "@" in text else 0.0
    is_https = 1.0 if parsed.scheme.lower() == "https" else 0.0

    digit_count = sum(ch.isdigit() for ch in text)
    digits_ratio = float(digit_count) / max(1.0, url_len)

    is_ip = 1.0 if _is_ip_host(hostname) else 0.0
    if is_ip or not hostname:
        subdomain_count = 0.0
    else:
        # Example: login.secure.paypal.com -> 4 labels -> 2 subdomains beyond domain+TLD
        labels = [part for part in hostname.split(".") if part]
        subdomain_count = float(max(0, len(labels) - 2))

    num_hyphens = float(text.count("-"))
    num_special_chars = float(sum(text.count(ch) for ch in ("?", "=", "&", "%", "_")))

    lowered = text.lower()
    keyword_hits = float(sum(1 for kw in SUSPICIOUS_KEYWORDS if kw in lowered))

    return [
        url_len,
        host_len,
        path_len,
        num_dots,
        has_at,
        is_https,
        digits_ratio,
        subdomain_count,
        is_ip,
        num_hyphens,
        num_special_chars,
        keyword_hits,
    ]


class URLLexicalFeatureExtractor(BaseEstimator, TransformerMixin):
    """Stateless sklearn transformer converting raw URL strings into lexical numeric features."""

    def fit(self, X: Iterable[str], y=None):  # noqa: N803
        return self

    def transform(self, X: Iterable[str]) -> np.ndarray:
        if isinstance(X, pd.DataFrame):
            series = X.iloc[:, 0].astype(str).tolist()
        elif isinstance(X, pd.Series):
            series = X.astype(str).tolist()
        else:
            series = [str(item) for item in X]

        rows = [extract_single_url_features(url) for url in series]
        return np.asarray(rows, dtype=np.float64)

    def get_feature_names_out(self, input_features=None) -> np.ndarray:
        return np.asarray(URL_FEATURE_NAMES, dtype=object)
