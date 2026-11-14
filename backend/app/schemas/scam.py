"""Pydantic schemas for Scam Shield SMS & URL predictions."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class FeatureContribution(BaseModel):
    feature: str
    value: float | str | None = None
    contribution: float
    direction: Literal["scam", "safe"]


class ScamSmsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, examples=["URGENT! Claim your free prize at http://bit.ly/win"])

    @field_validator("text")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("SMS text cannot be blank.")
        return cleaned


class ScamUrlRequest(BaseModel):
    url: str = Field(..., min_length=3, max_length=2048, examples=["http://secure-login.verify-account.example.com/update"])

    @field_validator("url")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("URL cannot be blank.")
        return cleaned


class ScamPredictionResponse(BaseModel):
    prediction_id: int
    sub_model: Literal["sms", "url"]
    label: Literal["safe", "suspicious", "scam"]
    scam_probability: float
    safe_probability: float
    threshold_low: float
    threshold_high: float
    model_name: str
    model_version: str
    top_contributors: list[FeatureContribution]
    extracted_features: dict[str, float] | None = None
    explanation_summary: str
