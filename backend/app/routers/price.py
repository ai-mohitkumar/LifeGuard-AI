"""FastAPI router for Fair Price used car & bike price regression."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.prediction import PredictionRecord
from app.models.user import User
from app.schemas.price import (
    BikePriceRequest,
    CarPriceRequest,
    FairPricePredictionResponse,
    PriceOptionsResponse,
)
from app.services.price_service import (
    get_price_options,
    predict_bike_price,
    predict_car_price,
)

router = APIRouter(prefix="/api/price", tags=["Fair Price"])


@router.get("/options", response_model=PriceOptionsResponse)
def read_price_options(_: User = Depends(get_current_user)) -> PriceOptionsResponse:
    """Return category options and sample vehicle listings for Car and Bike forms."""
    return PriceOptionsResponse(**get_price_options())


@router.post(
    "/predict-car",
    response_model=FairPricePredictionResponse,
    status_code=status.HTTP_200_OK,
)
def estimate_car_price(
    payload: CarPriceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FairPricePredictionResponse:
    """Predict used car resale price in INR, return SHAP drivers, and log to user history."""
    result = predict_car_price(payload.model_dump())

    record = PredictionRecord(
        user_id=current_user.id,
        module="price",
        sub_model="car",
        input_payload=payload.model_dump(),
        predicted_label=f"₹{round(result['predicted_price_inr']):,.0f}",
        predicted_value=result["predicted_price_inr"],
        probabilities={
            "range_low_inr": result["price_range_low_inr"],
            "range_high_inr": result["price_range_high_inr"],
            "uncertainty_mae_inr": result["uncertainty_mae_inr"],
            "baseline_price_inr": result["baseline_price_inr"],
        },
        explanation={
            "summary": result["explanation_summary"],
            "top_contributors": result["top_contributors"],
            "extracted_features": result["extracted_features"],
        },
        model_name=result["model_name"],
        model_version=result["model_version"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return FairPricePredictionResponse(prediction_id=record.id, **result)


@router.post(
    "/predict-bike",
    response_model=FairPricePredictionResponse,
    status_code=status.HTTP_200_OK,
)
def estimate_bike_price(
    payload: BikePriceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FairPricePredictionResponse:
    """Predict used bike resale price in INR, return SHAP drivers, and log to user history."""
    result = predict_bike_price(payload.model_dump())

    record = PredictionRecord(
        user_id=current_user.id,
        module="price",
        sub_model="bike",
        input_payload=payload.model_dump(),
        predicted_label=f"₹{round(result['predicted_price_inr']):,.0f}",
        predicted_value=result["predicted_price_inr"],
        probabilities={
            "range_low_inr": result["price_range_low_inr"],
            "range_high_inr": result["price_range_high_inr"],
            "uncertainty_mae_inr": result["uncertainty_mae_inr"],
            "baseline_price_inr": result["baseline_price_inr"],
        },
        explanation={
            "summary": result["explanation_summary"],
            "top_contributors": result["top_contributors"],
            "extracted_features": result["extracted_features"],
        },
        model_name=result["model_name"],
        model_version=result["model_version"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return FairPricePredictionResponse(prediction_id=record.id, **result)
