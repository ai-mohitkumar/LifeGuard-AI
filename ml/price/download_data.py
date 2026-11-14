"""Download used car and used bike datasets for Fair Price into data/price/.

Sources (CarDekho / BikeDekho public mirrors):
  - Used Cars: CAR DETAILS FROM CAR DEKHO.csv
  - Used Bikes: BIKE DETAILS.csv
"""

from pathlib import Path
import urllib.request

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "price"

CAR_MIRRORS = [
    "https://raw.githubusercontent.com/IMvision12/Car-Price_prediction/main/CAR%20DETAILS%20FROM%20CAR%20DEKHO.csv",
    "https://raw.githubusercontent.com/divyansh1195/Car-Price-Prediction/main/CAR%20DETAILS%20FROM%20CAR%20DEKHO.csv",
    "https://raw.githubusercontent.com/Rishabh-Gup12/Car-price-Prediction/main/CAR%20DETAILS%20FROM%20CAR%20DEKHO.csv",
]

BIKE_MIRRORS = [
    "https://raw.githubusercontent.com/Vishal422/Bikewala/main/BIKE%20DETAILS.csv",
    "https://raw.githubusercontent.com/Vishal422/Bikewala/master/BIKE%20DETAILS.csv",
]


def _download_with_mirrors(mirrors: list[str], dest_path: Path) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    for url in mirrors:
        try:
            print(f"Downloading {url} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "LifeGuard-AI/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read()
            if len(content) < 500:
                raise ValueError(f"Downloaded file too small ({len(content)} bytes)")
            dest_path.write_bytes(content)
            print(f"Saved {dest_path.name} ({len(content):,} bytes)")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"  Mirror failed ({exc}); trying next...")
            last_err = exc
    raise RuntimeError(f"All mirrors failed for {dest_path.name}: {last_err}")


def main() -> None:
    car_target = DATA_DIR / "car_details.csv"
    if car_target.exists():
        print(f"Already present: {car_target}")
    else:
        _download_with_mirrors(CAR_MIRRORS, car_target)

    bike_target = DATA_DIR / "bike_details.csv"
    if bike_target.exists():
        print(f"Already present: {bike_target}")
    else:
        _download_with_mirrors(BIKE_MIRRORS, bike_target)


if __name__ == "__main__":
    main()
