"""FastAPI application entrypoint for LifeGuard AI."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.security import hash_password
from app.database import SessionLocal, init_db
from app.models.user import User
from app.routers import aqi, auth, health, health_check, platform, price, scam
from app.services.registry_service import sync_model_registry


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize database tables, seed demo account, and sync ML model metadata on startup."""
    init_db()
    with SessionLocal() as db:
        sync_model_registry(db)
        demo_email = "mohit@lifeguard.ai"
        if not db.query(User).filter(User.email == demo_email).first():
            db.add(
                User(
                    full_name="Mohit Kumar",
                    email=demo_email,
                    hashed_password=hash_password("Enterprise@2026"),
                    is_active=True,
                )
            )
            db.commit()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "LifeGuard AI — Multi-module supervised learning platform for daily-life "
        "decision support (Scam Shield, Fair Price, Health Check, Air Aware)."
    ),
    lifespan=lifespan,
)

# Allow requests from the React dev server (localhost:5173) or configured origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(scam.router)
app.include_router(price.router)
app.include_router(health_check.router)
app.include_router(aqi.router)
app.include_router(platform.router)


@app.get("/", tags=["Root"])
def root() -> dict[str, str]:
    """Friendly root endpoint linking to interactive API docs."""
    return {
        "message": f"Welcome to {settings.APP_NAME} API",
        "docs": "/docs",
        "health": "/api/health",
    }
