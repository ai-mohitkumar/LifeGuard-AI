"""FastAPI router for Health Check diabetes & heart disease risk screening."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.prediction import PredictionRecord
from app.models.user import User
from app.schemas.health import (
    DiabetesScreenRequest,
    HealthPredictionResponse,
    HeartScreenRequest,
)
from app.services.health_service import (
    get_health_options,
    predict_diabetes_risk,
    predict_heart_risk,
)

router = APIRouter(prefix="/api/health-check", tags=["Health Check"])


@router.get("/options")
def read_health_options(_: User = Depends(get_current_user)) -> dict:
    """Return clinical choice options, calibration telemetry, and medical disclaimer."""
    return get_health_options()


@router.post(
    "/predict-diabetes",
    response_model=HealthPredictionResponse,
    status_code=status.HTTP_200_OK,
)
def screen_diabetes(
    payload: DiabetesScreenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HealthPredictionResponse:
    """Screen diabetes risk with calibrated probability + awareness disclaimer."""
    result = predict_diabetes_risk(payload.model_dump())

    record = PredictionRecord(
        user_id=current_user.id,
        module="health",
        sub_model="diabetes",
        input_payload=payload.model_dump(),
        predicted_label=result["risk_tier"],
        predicted_value=result["calibrated_probability"],
        probabilities={
            "low_risk": result["low_risk_probability"],
            "at_risk": result["calibrated_probability"],
        },
        explanation={
            "disclaimer": result["disclaimer"],
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

    return HealthPredictionResponse(prediction_id=record.id, **result)


@router.post(
    "/predict-heart",
    response_model=HealthPredictionResponse,
    status_code=status.HTTP_200_OK,
)
def screen_heart(
    payload: HeartScreenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HealthPredictionResponse:
    """Screen heart disease risk with calibrated probability + awareness disclaimer."""
    result = predict_heart_risk(payload.model_dump())

    record = PredictionRecord(
        user_id=current_user.id,
        module="health",
        sub_model="heart",
        input_payload=payload.model_dump(),
        predicted_label=result["risk_tier"],
        predicted_value=result["calibrated_probability"],
        probabilities={
            "low_risk": result["low_risk_probability"],
            "at_risk": result["calibrated_probability"],
        },
        explanation={
            "disclaimer": result["disclaimer"],
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

    return HealthPredictionResponse(prediction_id=record.id, **result)
