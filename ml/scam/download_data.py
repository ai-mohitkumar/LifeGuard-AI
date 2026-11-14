"""Download official UCI datasets for Scam Shield into data/scam/.

Datasets downloaded:
1. UCI SMS Spam Collection (Dataset ID 228) -> data/scam/SMSSpamCollection
2. UCI PhiUSIIL Phishing URL Dataset (Dataset ID 967) -> data/scam/PhiUSIIL_Phishing_URL_Dataset.csv
"""

from pathlib import Path
import urllib.request
import zipfile

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "scam"

SMS_ZIP_URL = "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
URL_ZIP_URL = "https://archive.ics.uci.edu/static/public/967/phiusiil+phishing+url+dataset.zip"


def download_and_extract(url: str, dest_dir: Path, zip_name: str) -> None:
    """Download a ZIP archive from UCI and extract its files into dest_dir."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dest_dir / zip_name

    print(f"Downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "LifeGuard-AI/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response, open(zip_path, "wb") as out:
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            out.write(chunk)

    print(f"Extracting {zip_path.name} ...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest_dir)

    zip_path.unlink(missing_ok=True)


def main() -> None:
    sms_target = DATA_DIR / "SMSSpamCollection"
    if sms_target.exists():
        print(f"Already present: {sms_target}")
    else:
        download_and_extract(SMS_ZIP_URL, DATA_DIR, "sms_spam_collection.zip")

    url_csvs = list(DATA_DIR.glob("*PhiUSIIL*.csv"))
    if url_csvs:
        print(f"Already present: {url_csvs[0]}")
    else:
        download_and_extract(URL_ZIP_URL, DATA_DIR, "phiusiil_phishing_url.zip")

    print("Available files in data/scam/:")
    for item in sorted(DATA_DIR.iterdir()):
        print(f"  - {item.name} ({item.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
