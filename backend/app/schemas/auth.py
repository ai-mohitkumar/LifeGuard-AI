"""Pydantic schemas for health check and JWT authentication."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: str


class UserRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, examples=["Aarav Sharma"])
    email: EmailStr = Field(..., examples=["aarav@example.com"])
    # bcrypt hashes up to 72 UTF-8 bytes; enforcing <= 72 bytes prevents silent truncation or ValueError.
    password: str = Field(..., min_length=8, max_length=72, examples=["StrongPass123"])
    confirm_password: str | None = Field(default=None, min_length=8, max_length=72)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must contain at least 2 non-whitespace characters.")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes.")
        return value

    @model_validator(mode="after")
    def validate_password_confirmation(self):
        if self.confirm_password is not None and self.password != self.confirm_password:
            raise ValueError("Password confirmation does not match password.")
        return self


class UserLoginRequest(BaseModel):
    email: EmailStr = Field(..., examples=["aarav@example.com"])
    password: str = Field(..., min_length=1, max_length=72, examples=["StrongPass123"])


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(
        ...,
        min_length=10,
        description="Google ID Token issued by Google Identity Services",
        examples=["eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."],
    )


class SocialLoginRequest(BaseModel):
    provider: str = Field(..., examples=["google", "github"])
    email: EmailStr = Field(..., examples=["user@gmail.com"])
    full_name: str = Field(default="", max_length=100)
    avatar_url: str | None = None


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
