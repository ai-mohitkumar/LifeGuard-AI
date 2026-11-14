"""Platform routers for per-user prediction history, feedback labels, and model registry."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models.model_registry import ModelRegistryEntry
from app.models.prediction import PredictionRecord
from app.models.user import User
from app.schemas.platform import (
    FeedbackSubmitRequest,
    ModelRegistryItem,
    PredictionHistoryItem,
)
from app.services.registry_service import sync_model_registry

router = APIRouter(prefix="/api", tags=["Platform"])


@router.get("/history", response_model=list[PredictionHistoryItem])
def list_prediction_history(
    module: str | None = Query(default=None, description="Optional filter: scam, price, health, aqi"),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PredictionHistoryItem]:
    """Return the signed-in user's predictions, newest first."""
    query = db.query(PredictionRecord).filter(PredictionRecord.user_id == current_user.id)
    if module:
        query = query.filter(PredictionRecord.module == module.strip().lower())
    records = query.order_by(PredictionRecord.created_at.desc(), PredictionRecord.id.desc()).limit(limit).all()
    return [PredictionHistoryItem.model_validate(item) for item in records]


@router.post("/history/{prediction_id}/feedback", response_model=PredictionHistoryItem)
def submit_prediction_feedback(
    prediction_id: int,
    payload: FeedbackSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PredictionHistoryItem:
    """Record 'Was this correct?' feedback for a prediction owned by the current user."""
    record = (
        db.query(PredictionRecord)
        .filter(
            PredictionRecord.id == prediction_id,
            PredictionRecord.user_id == current_user.id,
        )
        .first()
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prediction record not found.",
        )

    record.feedback_is_correct = payload.is_correct
    record.feedback_label = payload.correct_label.strip().lower() if payload.correct_label else None
    record.feedback_comment = payload.comment.strip() if payload.comment else None
    record.feedback_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    return PredictionHistoryItem.model_validate(record)


@router.get("/models", response_model=list[ModelRegistryItem])
def list_registered_models(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ModelRegistryItem]:
    """Return registered ML models, metrics, comparison tables, and error analysis."""
    sync_model_registry(db)
    entries = (
        db.query(ModelRegistryEntry)
        .order_by(ModelRegistryEntry.module.asc(), ModelRegistryEntry.sub_model.asc())
        .all()
    )
    return [ModelRegistryItem.model_validate(item) for item in entries]
