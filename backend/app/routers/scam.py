"""FastAPI router for Scam Shield SMS and URL predictions."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.prediction import PredictionRecord
from app.models.user import User
from app.schemas.scam import ScamPredictionResponse, ScamSmsRequest, ScamUrlRequest
from app.services.scam_service import predict_sms, predict_url

router = APIRouter(prefix="/api/scam", tags=["Scam Shield"])


@router.post(
    "/predict-sms",
    response_model=ScamPredictionResponse,
    status_code=status.HTTP_200_OK,
)
def classify_sms(
    payload: ScamSmsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScamPredictionResponse:
    """Classify an SMS message as safe / suspicious / scam and log to user history."""
    result = predict_sms(payload.text)

    record = PredictionRecord(
        user_id=current_user.id,
        module="scam",
        sub_model="sms",
        input_payload={"text": payload.text[:500]},
        predicted_label=result["label"],
        predicted_value=result["scam_probability"],
        probabilities={
            "safe": result["safe_probability"],
            "scam": result["scam_probability"],
        },
        explanation={
            "summary": result["explanation_summary"],
            "top_contributors": result["top_contributors"],
        },
        model_name=result["model_name"],
        model_version=result["model_version"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return ScamPredictionResponse(prediction_id=record.id, **result)


@router.post(
    "/predict-url",
    response_model=ScamPredictionResponse,
    status_code=status.HTTP_200_OK,
)
def classify_url(
    payload: ScamUrlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScamPredictionResponse:
    """Classify a URL using lexical features + SHAP and log to user history."""
    result = predict_url(payload.url)

    record = PredictionRecord(
        user_id=current_user.id,
        module="scam",
        sub_model="url",
        input_payload={"url": payload.url[:500]},
        predicted_label=result["label"],
        predicted_value=result["scam_probability"],
        probabilities={
            "safe": result["safe_probability"],
            "scam": result["scam_probability"],
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

    return ScamPredictionResponse(prediction_id=record.id, **result)
