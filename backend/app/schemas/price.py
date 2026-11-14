"""Pydantic schemas for Fair Price used car & used bike regression predictions."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class PriceFeatureContribution(BaseModel):
    feature: str
    value: float | str | None = None
    contribution_inr: float
    direction: Literal["increases_price", "decreases_price"]


class CarPriceRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, examples=["Maruti Swift Dzire VDI"])
    year: int = Field(..., ge=1985, le=2030, examples=[2016])
    km_driven: int = Field(..., ge=0, le=1_000_000, examples=[55000])
    fuel: str = Field(..., min_length=2, max_length=32, examples=["Diesel"])
    seller_type: str = Field(..., min_length=2, max_length=40, examples=["Individual"])
    transmission: str = Field(..., min_length=2, max_length=32, examples=["Manual"])
    owner: str = Field(..., min_length=2, max_length=40, examples=["First Owner"])

    @field_validator("name", "fuel", "seller_type", "transmission", "owner")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned


class BikePriceRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, examples=["Royal Enfield Classic 350"])
    year: int = Field(..., ge=1985, le=2030, examples=[2018])
    km_driven: int = Field(..., ge=0, le=500_000, examples=[15000])
    seller_type: str = Field(..., min_length=2, max_length=40, examples=["Individual"])
    owner: str = Field(..., min_length=2, max_length=40, examples=["1st owner"])
    ex_showroom_price: float | None = Field(
        default=None,
        ge=10_000,
        le=5_000_000,
        description="Optional original ex-showroom price in INR; imputed in pipeline if omitted.",
        examples=[165000.0],
    )

    @field_validator("name", "seller_type", "owner")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned


class FairPricePredictionResponse(BaseModel):
    prediction_id: int
    sub_model: Literal["car", "bike"]
    predicted_price_inr: float
    price_range_low_inr: float
    price_range_high_inr: float
    uncertainty_mae_inr: float
    baseline_price_inr: float
    model_name: str
    model_version: str
    top_contributors: list[PriceFeatureContribution]
    extracted_features: dict[str, float | str | None]
    explanation_summary: str


class PriceOptionsResponse(BaseModel):
    car: dict[str, Any]
    bike: dict[str, Any]
