"""Download benchmark clinical screening datasets for Health Check into data/health/.

Datasets:
  1. Pima Indians Diabetes (768 rows):
     Features: Pregnancies, Glucose, BloodPressure, SkinThickness, Insulin,
               BMI, DiabetesPedigreeFunction, Age -> Outcome (0/1)
  2. UCI Heart Disease - Cleveland Processed (303 rows):
     Features: age, sex, cp, trestbps, chol, fbs, restecg, thalach, exang,
               oldpeak, slope, ca, thal -> target (0 = healthy, 1 = heart disease)
"""

import io
from pathlib import Path
import urllib.request

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "health"

DIABETES_COLS = [
    "Pregnancies",
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
    "DiabetesPedigreeFunction",
    "Age",
    "Outcome",
]

HEART_COLS = [
    "age",
    "sex",
    "cp",
    "trestbps",
    "chol",
    "fbs",
    "restecg",
    "thalach",
    "exang",
    "oldpeak",
    "slope",
    "ca",
    "thal",
    "num",
]

DIABETES_MIRRORS = [
    "https://raw.githubusercontent.com/npradaschnor/Pima-Indians-Diabetes-Dataset/master/diabetes.csv",
    "https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.data.csv",
]

HEART_MIRRORS = [
    "https://archive.ics.uci.edu/ml/machine-learning-databases/heart-disease/processed.cleveland.data",
    "https://raw.githubusercontent.com/uciml/datasets/master/heart-disease/processed.cleveland.data",
]


def _fetch_bytes(mirrors: list[str]) -> tuple[bytes, str]:
    last_err: Exception | None = None
    for url in mirrors:
        try:
            print(f"Downloading {url} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "LifeGuard-AI/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read()
            if len(content) < 500:
                raise ValueError(f"Downloaded payload too small ({len(content)} bytes)")
            return content, url
        except Exception as exc:  # noqa: BLE001
            print(f"  Mirror failed ({exc}); trying next...")
            last_err = exc
    raise RuntimeError(f"All mirrors failed: {last_err}")


def download_diabetes() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dest = DATA_DIR / "diabetes.csv"
    if dest.exists():
        print(f"Already present: {dest}")
        return dest

    raw, _ = _fetch_bytes(DIABETES_MIRRORS)
    text = raw.decode("utf-8", errors="replace").strip()
    first_line = text.splitlines()[0]
    if "Glucose" in first_line and "Outcome" in first_line:
        df = pd.read_csv(io.StringIO(text))
    else:
        df = pd.read_csv(io.StringIO(text), header=None, names=DIABETES_COLS)

    df = df[DIABETES_COLS]
    df.to_csv(dest, index=False)
    print(f"Saved {dest.name} ({len(df)} rows, positive rate = {df['Outcome'].mean():.2%})")
    return dest


def download_heart() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dest = DATA_DIR / "heart_cleveland.csv"
    if dest.exists():
        print(f"Already present: {dest}")
        return dest

    raw, _ = _fetch_bytes(HEART_MIRRORS)
    text = raw.decode("utf-8", errors="replace").strip()
    df = pd.read_csv(io.StringIO(text), header=None, names=HEART_COLS, na_values=["?"])
    # UCI Cleveland encodes `num` in {0, 1, 2, 3, 4}; 0 = no disease, >=1 = disease present
    df["target"] = (pd.to_numeric(df["num"], errors="coerce") > 0).astype(int)
    df = df.drop(columns=["num"])
    df.to_csv(dest, index=False)
    print(f"Saved {dest.name} ({len(df)} rows, positive rate = {df['target'].mean():.2%})")
    return dest


def main() -> None:
    download_diabetes()
    download_heart()


if __name__ == "__main__":
    main()
