"""SQLAlchemy model tracking trained ML model versions, metrics, and error analysis."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ModelRegistryEntry(Base):
    """Metadata record for each trained model displayed on the Model Registry page."""

    __tablename__ = "model_registry"
    __table_args__ = (
        UniqueConstraint("module", "sub_model", "version", name="uq_model_module_sub_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    module: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    sub_model: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)

    metrics: Mapped[dict] = mapped_column(JSON, nullable=False)
    comparison_table: Mapped[list] = mapped_column(JSON, nullable=False)
    error_analysis: Mapped[dict] = mapped_column(JSON, nullable=False)
    limitations: Mapped[list] = mapped_column(JSON, nullable=False)
    thresholds: Mapped[dict] = mapped_column(JSON, nullable=False)

    artifact_path: Mapped[str] = mapped_column(String(255), nullable=False)
    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
