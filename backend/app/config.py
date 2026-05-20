from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "MedLib"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://medlib:medlib@db:5432/medlib"
    secret_key: str = Field(default="change-me-in-production")
    access_token_minutes: int = 480
    cors_origins: list[AnyHttpUrl] | list[str] = ["http://localhost:5173"]
    storage_dir: Path = Path("/data/books")
    ocr_language: str = "deu+eng"
    max_upload_mb: int = 2048
    root_admin_email: str | None = None
    root_admin_password: str | None = None
    root_admin_full_name: str = "Root Administrator"
    root_admin_update_password: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            # Handle JSON array string like '["https://example.com"]'
            if v.startswith("["):
                import json
                return json.loads(v)
            # Handle comma-separated string
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings
