"""Application configuration loaded from environment variables or .env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_ml_dir() -> str:
    """Locate the ml/ directory both inside Docker (/app/ml) and locally (<repo>/ml)."""
    backend_root = Path(__file__).resolve().parents[1]
    if (backend_root / "ml").exists():
        return str(backend_root / "ml")
    return str(backend_root.parent / "ml")


class Settings(BaseSettings):
    """Central settings object for database, JWT auth, CORS, and ML artifact paths."""

    APP_NAME: str = "LifeGuard AI"
    APP_VERSION: str = "0.2.0"

    # PostgreSQL connection string (overridden by Docker Compose or .env)
    DATABASE_URL: str = "postgresql://lifeguard:lifeguard_pass@localhost:5432/lifeguard_db"

    # JWT configuration (replace SECRET_KEY in production!)
    SECRET_KEY: str = "dev-only-change-this-to-a-long-random-secret-key-32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Comma-separated frontend origins allowed by CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Path to the ml/ directory containing module artifacts and importable feature extractors
    ML_DIR: str = _default_ml_dir()

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins cleanly."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()

