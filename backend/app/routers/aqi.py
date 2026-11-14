"""FastAPI router for Air Aware All-India AQI regression, category classification, and health advice."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.prediction import PredictionRecord
from app.models.user import User
from app.schemas.aqi import AqiForecastRequest, AqiForecastResponse
from app.services.aqi_service import (
    fetch_station_live_reading,
    get_aqi_options,
    get_india_overview,
    predict_next_day_aqi,
)

router = APIRouter(prefix="/api/aqi", tags=["Air Aware"])


@router.get("/options")
def read_aqi_options(_: User = Depends(get_current_user)) -> dict:
    """Return all 36 Indian States/UTs, 545+ stations, CPCB categories, presets, and state timelines."""
    return get_aqi_options()


@router.get("/india-overview")
def read_india_overview(_: User = Depends(get_current_user)) -> dict:
    """Return batch next-day AQI forecasts across all 36 Indian States/UTs and 545+ stations."""
    return get_india_overview()


@router.get("/station-live")
def read_station_live(
    station: str = Query(..., min_length=2, max_length=160),
    state: str | None = Query(default=None, max_length=80),
    _: User = Depends(get_current_user),
) -> dict:
    """Fetch live Open-Meteo Copernicus CAMS + Weather readings & causal lags for a station."""
    return fetch_station_live_reading(station_name=station, state_hint=state)


@router.post(
    "/forecast",
    response_model=AqiForecastResponse,
    status_code=status.HTTP_200_OK,
)
def forecast_next_day_aqi(
    payload: AqiForecastRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AqiForecastResponse:
    """Forecast tomorrow's numeric AQI + category + health advice and save to history."""
    payload_aliased = payload.model_dump(by_alias=True)
    result = predict_next_day_aqi(payload_aliased)

    record = PredictionRecord(
        user_id=current_user.id,
        module="aqi",
        sub_model="forecast",
        input_payload=payload_aliased,
        predicted_label=f"{result['predicted_category']} ({result['predicted_next_day_aqi']:.0f})",
        predicted_value=result["predicted_next_day_aqi"],
        probabilities=result["category_probabilities"],
        explanation={
            "summary": result["explanation_summary"],
            "health_advice": result["health_advice"],
            "top_contributors": result["top_contributors"],
            "extracted_features": result["extracted_features"],
        },
        model_name=f"{result['regressor_model_name']} + {result['classifier_model_name']}",
        model_version=result["model_version"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return AqiForecastResponse(prediction_id=record.id, **result)
