from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bootstrap import ensure_root_admin
from app.config import get_settings
from app.database import get_db
from app.routers import annotations, auth, books, dashboard, taxonomy, workspace

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(books.router, prefix="/api/books", tags=["books"])
app.include_router(annotations.router, prefix="/api/annotations", tags=["annotations"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(taxonomy.router, prefix="/api/taxonomy", tags=["taxonomy"])
app.include_router(workspace.router, prefix="/api/workspace", tags=["workspace"])


@app.on_event("startup")
def startup() -> None:
    import logging
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command

    log = logging.getLogger("medlib.startup")

    # 1) Ensure all tables exist (idempotent – safe to run every time)
    from app.database import Base, engine
    log.info("Ensuring database tables exist …")
    Base.metadata.create_all(bind=engine)
    log.info("Database tables ready.")

    # 2) Stamp Alembic to the current head so future migrations work
    try:
        alembic_cfg = AlembicConfig("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
        alembic_command.stamp(alembic_cfg, "head")
        log.info("Alembic stamped to head.")
    except Exception:
        log.warning("Alembic stamp failed (non-fatal)", exc_info=True)

    # 3) Create root admin if configured
    try:
        ensure_root_admin()
        log.info("Root admin check completed.")
    except Exception:
        log.exception("Root admin bootstrap failed")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/debug/env")
def debug_env() -> dict:
    """Temporary debug endpoint – remove before production."""
    return {
        "ROOT_ADMIN_EMAIL_set": bool(settings.root_admin_email),
        "ROOT_ADMIN_EMAIL_value": settings.root_admin_email or "(not set)",
        "ROOT_ADMIN_PASSWORD_set": bool(settings.root_admin_password),
        "ROOT_ADMIN_PASSWORD_length": len(settings.root_admin_password) if settings.root_admin_password else 0,
        "DATABASE_URL": settings.database_url[:30] + "…",
        "SECRET_KEY_set": settings.secret_key != "change-me-in-production",
    }


@app.get("/api/debug/users")
def debug_users(db: Session = Depends(get_db)) -> dict:
    """Temporary debug endpoint – remove before production."""
    from app.models import User
    users = db.scalars(select(User)).all()
    return {
        "count": len(users),
        "users": [{"email": u.email, "role": u.role.value, "is_active": u.is_active} for u in users],
    }


@app.post("/api/debug/create-root-admin")
def debug_create_root_admin(db: Session = Depends(get_db)) -> dict:
    """Manually trigger root admin creation from ENV vars."""
    from app.models import User
    from app.security import hash_password

    if not settings.root_admin_email or not settings.root_admin_password:
        return {"error": "ROOT_ADMIN_EMAIL or ROOT_ADMIN_PASSWORD not set"}

    email = settings.root_admin_email.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        return {"status": "already_exists", "email": existing.email, "role": existing.role.value}

    user = User(
        email=email,
        full_name=settings.root_admin_full_name,
        hashed_password=hash_password(settings.root_admin_password),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    return {"status": "created", "email": email}
