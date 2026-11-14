"""Pydantic schemas for Health Check diabetes & heart disease risk screening."""

from typing import Literal

from pydantic import BaseModel, Field


class HealthFeatureContribution(BaseModel):
    feature: str
    value: float | str | None = None
    contribution: float
    direction: Literal["higher_risk", "lower_risk"]


class DiabetesScreenRequest(BaseModel):
    Pregnancies: int = Field(..., ge=0, le=20, examples=[2])
    Glucose: float | None = Field(
        default=None,
        ge=20.0,
        le=400.0,
        description="Plasma glucose (mg/dL); leave blank if unavailable to impute in pipeline.",
        examples=[138.0],
    )
    BloodPressure: float | None = Field(default=None, ge=20.0, le=200.0, examples=[76.0])
    SkinThickness: float | None = Field(default=None, ge=1.0, le=120.0, examples=[28.0])
    Insulin: float | None = Field(default=None, ge=1.0, le=900.0, examples=[110.0])
    BMI: float | None = Field(default=None, ge=10.0, le=80.0, examples=[33.2])
    DiabetesPedigreeFunction: float = Field(..., ge=0.01, le=3.5, examples=[0.52])
    Age: int = Field(..., ge=18, le=110, examples=[42])


class HeartScreenRequest(BaseModel):
    age: int = Field(..., ge=18, le=110, examples=[58])
    sex: Literal[0, 1] = Field(..., description="1 = Male, 0 = Female", examples=[1])
    cp: Literal[1, 2, 3, 4] = Field(
        ...,
        description="Chest pain type: 1=typical angina, 2=atypical, 3=non-anginal, 4=asymptomatic",
        examples=[4],
    )
    trestbps: float = Field(..., ge=60.0, le=250.0, description="Resting BP (mm Hg)", examples=[140.0])
    chol: float = Field(..., ge=80.0, le=650.0, description="Serum cholesterol (mg/dL)", examples=[254.0])
    fbs: Literal[0, 1] = Field(..., description="Fasting blood sugar > 120 mg/dL (1=true, 0=false)", examples=[0])
    restecg: Literal[0, 1, 2] = Field(..., description="Resting ECG: 0=normal, 1=ST-T abn, 2=LVH", examples=[2])
    thalach: float = Field(..., ge=50.0, le=230.0, description="Max heart rate achieved", examples=[132.0])
    exang: Literal[0, 1] = Field(..., description="Exercise induced angina (1=yes, 0=no)", examples=[1])
    oldpeak: float = Field(..., ge=0.0, le=8.0, description="ST depression induced by exercise", examples=[1.8])
    slope: Literal[1, 2, 3] = Field(..., description="Peak exercise ST slope: 1=up, 2=flat, 3=down", examples=[2])
    ca: int | None = Field(
        default=None,
        ge=0,
        le=3,
        description="Major vessels colored by fluoroscopy (0-3); optional (imputed if omitted)",
        examples=[1],
    )
    thal: Literal[3, 6, 7] | None = Field(
        default=None,
        description="Thallium stress result (3=normal, 6=fixed defect, 7=reversible defect); optional",
        examples=[7],
    )


class HealthPredictionResponse(BaseModel):
    prediction_id: int
    sub_model: Literal["diabetes", "heart"]
    risk_tier: Literal["low_risk", "moderate_risk", "elevated_risk"]
    calibrated_probability: float
    low_risk_probability: float
    threshold_moderate: float
    threshold_elevated: float
    model_name: str
    model_version: str
    disclaimer: str
    top_contributors: list[HealthFeatureContribution]
    extracted_features: dict[str, float | str | None]
    explanation_summary: str
