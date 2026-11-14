# LifeGuard AI

A multi-module supervised machine learning web platform for daily-life decision support (BTech Final-Year Project).

## Planned Modules
1. **Scam Shield** — SMS & URL scam classification (`safe` / `suspicious` / `scam`) with threshold tuning and feature explanations.
2. **Fair Price** — Used car & bike price regression (Ridge baseline, Random Forest, XGBoost, LightGBM) with SHAP explanations.
3. **Health Check** — Awareness-only diabetes & heart disease risk screening with calibrated probabilities (not medical advice).
4. **Air Aware** — Next-day AQI value & category forecasting using strict chronological splits and health advisories.

## Project Structure
```text
LifeGuard AI/
├── ml/{scam,price,health,aqi}/   # Training, evaluation, and EDA notebooks
├── backend/                       # FastAPI app, SQLAlchemy models, Pydantic schemas, JWT auth
├── frontend/                      # React + Vite + Tailwind CSS UI shell
├── data/                          # Local datasets (gitignored)
├── tests/                         # Pytest test suite
├── docker-compose.yml             # PostgreSQL + FastAPI + React dev stack
└── .env.example                   # Environment template
```

## Phase 1: Quick Start (Docker Compose)
```bash
cp .env.example .env
docker compose up --build
```
- **Frontend:** http://localhost:5173
- **Backend API Docs (Swagger):** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/api/health

## Phase 1: Local Verification (without Docker)
### 1. Backend & Pytest
```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements.txt
.\.venv\Scripts\pytest -v
```
To run FastAPI locally against PostgreSQL (ensure `DATABASE_URL` in `.env` points to a running Postgres instance):
```powershell
cd backend
..\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

### 2. Frontend
```powershell
cd frontend
npm install
npm run build
npm run dev
```

## Phase 2: Scam Shield Training & Evaluation
1. Download the official UCI datasets (`SMSSpamCollection` and `PhiUSIIL_Phishing_URL_Dataset.csv`):
```powershell
.\.venv\Scripts\python.exe ml\scam\download_data.py
```
2. Install ML dependencies and run the leakage-safe training pipeline (saves `.joblib` bundles + `metadata.json` under `ml/scam/artifacts/`):
```powershell
.\.venv\Scripts\pip.exe install -r ml\requirements.txt
.\.venv\Scripts\python.exe ml\scam\train.py
```
3. Inspect the comparison tables, untouched test metrics, error analysis, and limitations:
```powershell
.\.venv\Scripts\python.exe ml\scam\evaluate.py
```
4. Re-run the full backend test suite (Phase 1 + Phase 2):
```powershell
.\.venv\Scripts\pytest.exe -v
```

## Phase 3: Fair Price Training & Evaluation
1. Download the used car & used bike datasets (`car_details.csv` and `bike_details.csv`):
```powershell
.\.venv\Scripts\python.exe ml\price\download_data.py
```
2. Run the leakage-safe regression pipeline (compares Dummy Baseline, Ridge Baseline, Random Forest, XGBoost, and LightGBM on MAE/RMSE/R² and saves `.joblib` bundles + `metadata.json` under `ml/price/artifacts/`):
```powershell
.\.venv\Scripts\python.exe ml\price\train.py
```
3. Inspect CV comparison tables, untouched test MAE/RMSE/R², tier error breakdown, worst residuals, and limitations:
```powershell
.\.venv\Scripts\python.exe ml\price\evaluate.py
```
4. Run the full test suite (Phase 1 + Phase 2 + Phase 3):
```powershell
.\.venv\Scripts\pytest.exe -v
```

## Phase 4: Health Check Training & Evaluation
1. Download the clinical screening datasets (`diabetes.csv` and `heart_cleveland.csv`):
```powershell
.\.venv\Scripts\python.exe ml\health\download_data.py
```
2. Run the leakage-safe SMOTE + probability-calibration training pipeline (`imblearn.pipeline.Pipeline` + `CalibratedClassifierCV`):
```powershell
.\.venv\Scripts\python.exe ml\health\train.py
```
3. Inspect CV comparison tables (ROC-AUC, Recall, Brier score), untouched test calibration curves, error analysis, and limitations:
```powershell
.\.venv\Scripts\python.exe ml\health\evaluate.py
```
4. Run the full test suite (Phase 1 + Phase 2 + Phase 3 + Phase 4):
```powershell
.\.venv\Scripts\pytest.exe -v
```

## Phase 5: Air Aware Training & Evaluation (All-India 36 States & UTs)
1. Download the All-India CPCB station catalog + multi-year daily Copernicus CAMS air quality & ERA5 meteorology (`daily_air_quality.csv`, `india_stations.json`, and `ml/aqi/station_lookup.json`):
```powershell
.\.venv\Scripts\python.exe ml\aqi\download_data.py
```
2. Run the strict chronological regression + classification training pipeline (expanding-window date CV, Persistence & Ridge/LR baselines vs Random Forest / XGBoost / LightGBM, no random split):
```powershell
.\.venv\Scripts\python.exe ml\aqi\train.py
```
3. Inspect chronological CV comparison tables, untouched future test metrics, seasonal error analysis, and limitations:
```powershell
.\.venv\Scripts\python.exe ml\aqi\evaluate.py
```
4. Run the complete platform test suite across all four modules:
```powershell
.\.venv\Scripts\pytest.exe -v
```



