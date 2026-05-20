from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap import ensure_root_admin
from app.config import get_settings
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
