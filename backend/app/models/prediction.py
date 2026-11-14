"""SQLAlchemy model storing per-user predictions and 'Was this correct?' feedback."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PredictionRecord(Base):
    """Stores one prediction made by an authenticated user across any LifeGuard module."""

    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    module: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    sub_model: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Store input summary, predictions, and explainability payloads cleanly as JSON.
    input_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    predicted_label: Mapped[str] = mapped_column(String(100), nullable=False)
    predicted_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    probabilities: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    explanation: Mapped[dict] = mapped_column(JSON, nullable=False)

    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)

    # Feedback captured via the "Was this correct?" widget
    feedback_is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    feedback_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    feedback_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
