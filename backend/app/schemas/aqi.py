"""Pydantic schemas for Air Aware next-day AQI value + category forecasting."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class AqiFeatureContribution(BaseModel):
    feature: str
    value: float | str | None = None
    contribution: float
    direction: Literal["increases_aqi", "improves_air"]


class AqiHealthAdvice(BaseModel):
    risk_level: str
    general_public: str
    sensitive_groups: str
    outdoor_activity: str
    mask_guidance: str
    alert_note: str | None = None


class AqiForecastRequest(BaseModel):
    station: str = Field(..., min_length=2, max_length=160, examples=["ITO Delhi CPCB"])
    state: str | None = Field(default=None, max_length=80, examples=["Delhi"])
    city: str | None = Field(default=None, max_length=80, examples=["Delhi"])
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-11-11"])
    PM2_5: float | None = Field(default=None, alias="PM2.5", ge=0.0, le=1000.0, examples=[115.0])
    PM10: float = Field(..., ge=0.0, le=1500.0, examples=[160.0])
    SO2: float | None = Field(default=None, ge=0.0, le=1000.0, examples=[22.0])
    NO2: float | None = Field(default=None, ge=0.0, le=500.0, examples=[68.0])
    CO_mg: float | None = Field(default=None, ge=0.0, le=50.0, examples=[1.8])
    O3: float | None = Field(default=None, ge=0.0, le=600.0, examples=[64.0])
    TEMP: float = Field(..., ge=-40.0, le=55.0, examples=[2.5])
    PRES: float = Field(..., ge=850.0, le=1060.0, examples=[1022.0])
    DEWP: float = Field(..., ge=-50.0, le=40.0, examples=[-8.0])
    RAIN: float = Field(default=0.0, ge=0.0, le=500.0, examples=[0.0])
    WSPM: float = Field(..., ge=0.0, le=30.0, examples=[1.6])
    AQI: float = Field(..., ge=0.0, le=500.0, examples=[235.0])
    aqi_lag1: float | None = Field(default=None, ge=0.0, le=500.0, examples=[210.0])
    aqi_roll3_mean: float | None = Field(default=None, ge=0.0, le=500.0, examples=[198.0])
    aqi_roll7_mean: float | None = Field(default=None, ge=0.0, le=500.0, examples=[185.0])
    wspm_roll3_mean: float | None = Field(default=None, ge=0.0, le=30.0, examples=[1.9])

    model_config = {"populate_by_name": True}

    @field_validator("station")
    @classmethod
    def validate_station(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Station name cannot be blank.")
        return cleaned


class AqiForecastResponse(BaseModel):
    prediction_id: int
    predicted_next_day_aqi: float
    aqi_range_low: float
    aqi_range_high: float
    uncertainty_mae: float
    predicted_category: str
    regression_implied_category: str
    category_probabilities: dict[str, float]
    unhealthy_probability: float
    unhealthy_alert: bool
    unhealthy_alert_threshold: float
    regressor_model_name: str
    classifier_model_name: str
    model_version: str
    health_advice: AqiHealthAdvice
    top_contributors: list[AqiFeatureContribution]
    extracted_features: dict[str, Any]
    explanation_summary: str
