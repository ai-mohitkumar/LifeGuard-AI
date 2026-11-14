"""Pydantic schemas for Prediction History, Feedback, and Model Registry."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class FeedbackSubmitRequest(BaseModel):
    is_correct: bool = Field(..., description="Whether the model prediction matched ground truth.")
    correct_label: str | None = Field(
        default=None,
        max_length=100,
        description="Optional corrected label (e.g. safe, suspicious, scam).",
    )
    comment: str | None = Field(default=None, max_length=500)


class PredictionHistoryItem(BaseModel):
    id: int
    module: str
    sub_model: str | None
    input_payload: dict[str, Any]
    predicted_label: str
    predicted_value: float | None
    probabilities: dict[str, Any] | None
    explanation: dict[str, Any]
    model_name: str
    model_version: str
    feedback_is_correct: bool | None
    feedback_label: str | None
    feedback_comment: str | None
    feedback_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModelRegistryItem(BaseModel):
    id: int
    module: str
    sub_model: str
    model_name: str
    version: str
    metrics: dict[str, Any]
    comparison_table: list[dict[str, Any]]
    error_analysis: dict[str, Any]
    limitations: list[str]
    thresholds: dict[str, Any]
    artifact_path: str
    trained_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
