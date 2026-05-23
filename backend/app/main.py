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
    # 1) Run Alembic migrations automatically on deploy
    try:
        from alembic.config import Config as AlembicConfig
        from alembic import command
        print("[medlib] Running database migrations …")
        alembic_cfg = AlembicConfig("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("[medlib] Database migrations completed.")
    except Exception as exc:
        print(f"[medlib] Alembic migration failed: {exc}")
        # Fallback: ensure tables exist for dev environments
        try:
            from app.database import Base, engine
            print("[medlib] Falling back to create_all …")
            Base.metadata.create_all(bind=engine)
            print("[medlib] Database tables ready (create_all).")
        except Exception as fallback_exc:
            print(f"[medlib] create_all also failed: {fallback_exc}")

    # 2) Create root admin if configured
    try:
        ensure_root_admin()
        print("[medlib] Root admin check completed.")
    except Exception as exc:
        print(f"[medlib] Root admin bootstrap failed: {exc}")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}
