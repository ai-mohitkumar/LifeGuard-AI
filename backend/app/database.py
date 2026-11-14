"""SQLAlchemy engine, session factory, and FastAPI DB dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""


# SQLite needs check_same_thread=False when shared across FastAPI test requests.
connect_args = (
    {"check_same_thread": False}
    if settings.DATABASE_URL.startswith("sqlite")
    else {}
)

# pool_pre_ping=True checks connection health before executing queries.
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Yield a scoped database session per request and always close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create database tables if they do not exist yet.

    Note: In production or later phases, Alembic migrations can replace this.
    """
    # Import all ORM models so SQLAlchemy registers them on Base.metadata before create_all.
    from app.models import model_registry, prediction, user  # noqa: F401

    Base.metadata.create_all(bind=engine)
